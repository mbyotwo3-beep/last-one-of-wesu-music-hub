-- 1) Lock down SECURITY DEFINER functions: internal use only
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

-- 2) Public follower count without a publicly-callable function
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS follower_count integer NOT NULL DEFAULT 0;

UPDATE public.artists a
SET follower_count = COALESCE((SELECT COUNT(*) FROM public.artist_followers f WHERE f.artist_id = a.id), 0);

CREATE OR REPLACE FUNCTION public.sync_artist_follower_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.artists SET follower_count = follower_count + 1 WHERE id = NEW.artist_id;
    RETURN NEW;
  ELSE
    UPDATE public.artists SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.artist_id;
    RETURN OLD;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.sync_artist_follower_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_artist_follower_count ON public.artist_followers;
CREATE TRIGGER trg_sync_artist_follower_count
AFTER INSERT OR DELETE ON public.artist_followers
FOR EACH ROW EXECUTE FUNCTION public.sync_artist_follower_count();

-- 3) Artists may only accept/decline a label invitation
CREATE OR REPLACE FUNCTION public.label_artists_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_label_owner(auth.uid(), NEW.label_id) OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Non-owners (the artist) may only change status / joined_at
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

REVOKE ALL ON FUNCTION public.label_artists_guard() FROM PUBLIC, anon, authenticated;

-- 4) Invitation participants may only change status / responded_at
CREATE OR REPLACE FUNCTION public.invitations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

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

REVOKE ALL ON FUNCTION public.invitations_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_invitations_guard ON public.invitations;
CREATE TRIGGER trg_invitations_guard
BEFORE UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.invitations_guard();

-- 5) Payout requests can never exceed the real available balance
CREATE OR REPLACE FUNCTION public.enforce_payout_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE available numeric;
BEGIN
  -- Staff can record adjustments directly
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

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

  -- Derived money columns are computed server-side, never trusted from the client
  NEW.gross_amount := NEW.amount;
  NEW.net_amount := COALESCE(NEW.net_amount, NEW.amount);
  NEW.status := 'pending';

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.enforce_payout_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_payout_balance ON public.payouts;
CREATE TRIGGER trg_enforce_payout_balance
BEFORE INSERT ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.enforce_payout_balance();