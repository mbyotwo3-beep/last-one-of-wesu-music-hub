CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','superadmin'))
$$;

CREATE OR REPLACE FUNCTION private.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin')
$$;

CREATE OR REPLACE FUNCTION private.is_label_owner(_uid uuid, _label_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.labels WHERE id = _label_id AND owner_user_id = _uid)
$$;

CREATE OR REPLACE FUNCTION private.is_song_collaborator(_uid uuid, _song_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.song_collaborators sc
    JOIN public.artists a ON a.id = sc.artist_id
    WHERE sc.song_id = _song_id AND a.user_id = _uid AND sc.accepted = true
  )
$$;

CREATE OR REPLACE FUNCTION private.artist_user_id(_artist_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.artists WHERE id = _artist_id
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated, service_role;

-- Repoint every policy that referenced the public copies
DO $$
DECLARE
  r record;
  cmd text;
  newq text;
  newwc text;
  roles text;
  pat text := '\m(has_role|is_staff|is_superadmin|is_label_owner|is_song_collaborator|artist_user_id)\(';
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl, p.polname, p.polcmd,
           pg_get_expr(p.polqual, p.polrelid) AS q,
           pg_get_expr(p.polwithcheck, p.polrelid) AS wc,
           COALESCE(
             (SELECT string_agg(quote_ident(pr.rolname), ', ')
              FROM pg_roles pr WHERE pr.oid = ANY(p.polroles)), 'public') AS rls
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ~ pat
       OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ pat
  LOOP
    cmd := CASE r.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END;
    newq := regexp_replace(COALESCE(r.q, ''), pat, 'private.\1(', 'g');
    newwc := regexp_replace(COALESCE(r.wc, ''), pat, 'private.\1(', 'g');
    roles := COALESCE(NULLIF(r.rls, ''), 'public');

    EXECUTE format('DROP POLICY %I ON %I.%I', r.polname, r.sch, r.tbl);
    EXECUTE format('CREATE POLICY %I ON %I.%I FOR %s TO %s %s %s',
      r.polname, r.sch, r.tbl, cmd, roles,
      CASE WHEN r.q IS NOT NULL THEN 'USING (' || newq || ')' ELSE '' END,
      CASE WHEN r.wc IS NOT NULL THEN 'WITH CHECK (' || newwc || ')' ELSE '' END);
  END LOOP;
END $$;

-- Trigger guards now use the private helpers
CREATE OR REPLACE FUNCTION public.label_artists_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF private.is_label_owner(auth.uid(), NEW.label_id) OR private.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.label_id IS DISTINCT FROM OLD.label_id
     OR NEW.artist_id IS DISTINCT FROM OLD.artist_id
     OR NEW.royalty_pct IS DISTINCT FROM OLD.royalty_pct
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the label owner can change roster terms';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('active', 'declined', 'left') THEN
    RAISE EXCEPTION 'Artists may only accept or decline a label invitation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.invitations_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF private.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
     OR NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
     OR NEW.to_email IS DISTINCT FROM OLD.to_email
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the status of an invitation can be changed';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_payout_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE available numeric;
BEGIN
  IF private.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero';
  END IF;
  IF NEW.label_id IS NOT NULL THEN
    available := public.get_label_available_balance(NEW.label_id);
  ELSE
    available := public.get_artist_available_balance(NEW.artist_id);
  END IF;
  IF NEW.amount > available THEN
    RAISE EXCEPTION 'Payout amount (%) exceeds available balance (%)', NEW.amount, available;
  END IF;
  NEW.gross_amount := NEW.amount;
  NEW.net_amount := COALESCE(NEW.net_amount, NEW.amount);
  NEW.status := 'pending';
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.grant_artist_role_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'artist'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- Remove the publicly callable copies
DROP FUNCTION IF EXISTS public.get_artist_follower_count(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(uuid);
DROP FUNCTION IF EXISTS public.is_superadmin(uuid);
DROP FUNCTION IF EXISTS public.is_label_owner(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_song_collaborator(uuid, uuid);
DROP FUNCTION IF EXISTS public.artist_user_id(uuid);

-- Anything still SECURITY DEFINER in the exposed schema stays internal-only
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;