
-- ============ LABELS ============
CREATE TABLE public.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bio text,
  logo_url text,
  contact_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  commission_pct numeric NOT NULL DEFAULT 15 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.labels TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labels TO authenticated;
GRANT ALL ON public.labels TO service_role;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "labels public read approved" ON public.labels FOR SELECT USING (status='approved' OR owner_user_id=auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "labels owner insert" ON public.labels FOR INSERT TO authenticated WITH CHECK (owner_user_id=auth.uid());
CREATE POLICY "labels owner update" ON public.labels FOR UPDATE TO authenticated USING (owner_user_id=auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (owner_user_id=auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "labels staff delete" ON public.labels FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_label_owner(_uid uuid, _label_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.labels WHERE id=_label_id AND owner_user_id=_uid)
$$;

CREATE OR REPLACE FUNCTION public.artist_user_id(_artist_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT user_id FROM public.artists WHERE id=_artist_id
$$;

-- ============ LABEL ARTISTS ============
CREATE TABLE public.label_artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','left','removed')),
  royalty_pct numeric NOT NULL DEFAULT 80 CHECK (royalty_pct >= 0 AND royalty_pct <= 100),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(label_id, artist_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.label_artists TO authenticated;
GRANT ALL ON public.label_artists TO service_role;
ALTER TABLE public.label_artists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "label_artists read" ON public.label_artists FOR SELECT TO authenticated USING (
  public.is_label_owner(auth.uid(), label_id)
  OR public.artist_user_id(artist_id) = auth.uid()
  OR public.is_staff(auth.uid())
);
CREATE POLICY "label_artists owner manage" ON public.label_artists FOR ALL TO authenticated
  USING (public.is_label_owner(auth.uid(), label_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.is_label_owner(auth.uid(), label_id) OR public.is_staff(auth.uid()));
CREATE POLICY "label_artists artist accept" ON public.label_artists FOR UPDATE TO authenticated
  USING (public.artist_user_id(artist_id) = auth.uid())
  WITH CHECK (public.artist_user_id(artist_id) = auth.uid());

-- ============ ARTISTS / SONGS extensions ============
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS label_id uuid REFERENCES public.labels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepts_collabs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_for_features boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_rate numeric DEFAULT 0;

ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS label_id uuid REFERENCES public.labels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allow_collab_requests boolean NOT NULL DEFAULT true;

-- ============ SONG COLLABORATORS ============
CREATE TABLE public.song_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'featured' CHECK (role IN ('main','featured','producer','writer','remixer')),
  split_pct numeric NOT NULL DEFAULT 0 CHECK (split_pct >= 0 AND split_pct <= 100),
  accepted boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(song_id, artist_id)
);
GRANT SELECT ON public.song_collaborators TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_collaborators TO authenticated;
GRANT ALL ON public.song_collaborators TO service_role;
ALTER TABLE public.song_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collabs public read accepted" ON public.song_collaborators FOR SELECT USING (accepted = true);
CREATE POLICY "collabs participant read" ON public.song_collaborators FOR SELECT TO authenticated USING (
  public.artist_user_id(artist_id) = auth.uid()
  OR EXISTS (SELECT 1 FROM public.songs s JOIN public.artists a ON a.id=s.artist_id WHERE s.id=song_id AND a.user_id=auth.uid())
  OR public.is_staff(auth.uid())
);
CREATE POLICY "collabs song owner manage" ON public.song_collaborators FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.songs s JOIN public.artists a ON a.id=s.artist_id WHERE s.id=song_id AND a.user_id=auth.uid()) OR public.is_staff(auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.songs s JOIN public.artists a ON a.id=s.artist_id WHERE s.id=song_id AND a.user_id=auth.uid()) OR public.is_staff(auth.uid()));
CREATE POLICY "collabs invitee accept" ON public.song_collaborators FOR UPDATE TO authenticated
  USING (public.artist_user_id(artist_id) = auth.uid())
  WITH CHECK (public.artist_user_id(artist_id) = auth.uid());

CREATE OR REPLACE FUNCTION public.check_split_total() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE total numeric;
BEGIN
  SELECT COALESCE(SUM(split_pct),0) INTO total FROM public.song_collaborators
    WHERE song_id = NEW.song_id AND id <> COALESCE(NEW.id, gen_random_uuid());
  IF total + NEW.split_pct > 100 THEN
    RAISE EXCEPTION 'Total collaborator split for song cannot exceed 100%% (current=%, new=%)', total, NEW.split_pct;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_check_split_total BEFORE INSERT OR UPDATE ON public.song_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.check_split_total();

CREATE OR REPLACE FUNCTION public.is_song_collaborator(_uid uuid, _song_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.song_collaborators sc
    JOIN public.artists a ON a.id = sc.artist_id
    WHERE sc.song_id=_song_id AND a.user_id=_uid AND sc.accepted=true
  )
$$;

-- ============ FEATURED SLOTS ============
CREATE TABLE public.featured_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_type text NOT NULL CHECK (slot_type IN ('home_hero','home_trending','home_artist','genre_top','editorial')),
  target_type text NOT NULL CHECK (target_type IN ('song','album','artist','playlist','label')),
  target_id uuid NOT NULL,
  position int NOT NULL DEFAULT 0,
  title text,
  subtitle text,
  image_url text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.featured_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.featured_slots TO authenticated;
GRANT ALL ON public.featured_slots TO service_role;
ALTER TABLE public.featured_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slots public read active" ON public.featured_slots FOR SELECT USING (active=true);
CREATE POLICY "slots staff manage" ON public.featured_slots FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ INVITATIONS ============
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('label_invite_artist','collab_invite','feature_request','label_apply')),
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invitations participant read" ON public.invitations FOR SELECT TO authenticated
  USING (from_user_id=auth.uid() OR to_user_id=auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "invitations sender insert" ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (from_user_id=auth.uid());
CREATE POLICY "invitations participant update" ON public.invitations FOR UPDATE TO authenticated
  USING (from_user_id=auth.uid() OR to_user_id=auth.uid())
  WITH CHECK (from_user_id=auth.uid() OR to_user_id=auth.uid());

-- ============ REVENUE SPLITS ============
CREATE TABLE public.revenue_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  payee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payee_role text NOT NULL CHECK (payee_role IN ('platform','artist','label','collaborator')),
  label_id uuid REFERENCES public.labels(id) ON DELETE SET NULL,
  artist_id uuid REFERENCES public.artists(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  pct numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.revenue_splits TO authenticated;
GRANT ALL ON public.revenue_splits TO service_role;
ALTER TABLE public.revenue_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "splits payee read" ON public.revenue_splits FOR SELECT TO authenticated
  USING (payee_user_id=auth.uid() OR public.is_staff(auth.uid())
    OR (label_id IS NOT NULL AND public.is_label_owner(auth.uid(), label_id)));

-- ============ PAYOUTS extensions ============
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS gross_amount numeric,
  ADD COLUMN IF NOT EXISTS platform_fee numeric,
  ADD COLUMN IF NOT EXISTS label_fee numeric,
  ADD COLUMN IF NOT EXISTS net_amount numeric,
  ADD COLUMN IF NOT EXISTS label_id uuid REFERENCES public.labels(id) ON DELETE SET NULL;

-- ============ SPLIT TRIGGER ============
CREATE OR REPLACE FUNCTION public.compute_revenue_splits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_song_id uuid;
  v_album_id uuid;
  v_artist_id uuid;
  v_artist_user uuid;
  v_label_id uuid;
  v_commission numeric;
  v_label_pct numeric;
  v_label_owner uuid;
  v_platform_amount numeric;
  v_label_amount numeric;
  v_artist_pool numeric;
  v_total_collab_pct numeric;
  v_main_pct numeric;
  collab record;
BEGIN
  IF NEW.status <> 'paid' OR (TG_OP='UPDATE' AND OLD.status='paid') THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.revenue_splits WHERE transaction_id = NEW.id;

  -- platform commission
  SELECT COALESCE((value)::numeric, 15) INTO v_commission
    FROM public.platform_settings WHERE key='commission_pct' LIMIT 1;
  IF v_commission IS NULL THEN v_commission := 15; END IF;

  -- resolve song/artist/label
  IF NEW.item_type = 'song' THEN
    SELECT id, artist_id, label_id INTO v_song_id, v_artist_id, v_label_id FROM public.songs WHERE id=NEW.item_id;
  ELSIF NEW.item_type = 'album' THEN
    SELECT id, artist_id INTO v_album_id, v_artist_id FROM public.albums WHERE id=NEW.item_id;
    SELECT label_id INTO v_label_id FROM public.artists WHERE id=v_artist_id;
  ELSE
    -- subscription / unknown → all to platform
    INSERT INTO public.revenue_splits(transaction_id, payee_role, amount, pct)
      VALUES (NEW.id, 'platform', NEW.amount, 100);
    RETURN NEW;
  END IF;

  v_platform_amount := round(NEW.amount * v_commission / 100, 2);
  INSERT INTO public.revenue_splits(transaction_id, payee_role, amount, pct)
    VALUES (NEW.id, 'platform', v_platform_amount, v_commission);

  v_artist_pool := NEW.amount - v_platform_amount;

  -- label cut
  IF v_label_id IS NOT NULL THEN
    SELECT commission_pct, owner_user_id INTO v_label_pct, v_label_owner FROM public.labels WHERE id=v_label_id;
    v_label_amount := round(v_artist_pool * v_label_pct / 100, 2);
    INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, label_id, amount, pct)
      VALUES (NEW.id, v_label_owner, 'label', v_label_id, v_label_amount, v_label_pct);
    v_artist_pool := v_artist_pool - v_label_amount;
  END IF;

  -- collaborators
  SELECT COALESCE(SUM(split_pct),0) INTO v_total_collab_pct
    FROM public.song_collaborators
    WHERE song_id = v_song_id AND accepted=true AND role <> 'main';

  v_main_pct := 100 - v_total_collab_pct;
  SELECT user_id INTO v_artist_user FROM public.artists WHERE id=v_artist_id;

  IF v_main_pct > 0 THEN
    INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
      VALUES (NEW.id, v_artist_user, 'artist', v_artist_id,
              round(v_artist_pool * v_main_pct / 100, 2), v_main_pct);
  END IF;

  IF v_song_id IS NOT NULL THEN
    FOR collab IN
      SELECT sc.artist_id, sc.split_pct, a.user_id
      FROM public.song_collaborators sc
      JOIN public.artists a ON a.id = sc.artist_id
      WHERE sc.song_id = v_song_id AND sc.accepted=true AND sc.role <> 'main'
    LOOP
      INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
        VALUES (NEW.id, collab.user_id, 'collaborator', collab.artist_id,
                round(v_artist_pool * collab.split_pct / 100, 2), collab.split_pct);
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_compute_revenue_splits
  AFTER INSERT OR UPDATE OF status ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.compute_revenue_splits();

-- updated_at trigger for labels
CREATE TRIGGER trg_labels_updated BEFORE UPDATE ON public.labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default commission setting if missing
INSERT INTO public.platform_settings(key, value)
  VALUES ('commission_pct', '15'::jsonb)
  ON CONFLICT (key) DO NOTHING;
