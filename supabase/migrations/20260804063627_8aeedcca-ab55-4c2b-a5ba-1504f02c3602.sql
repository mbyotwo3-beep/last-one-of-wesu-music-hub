-- ===== public collaborator view (no split_pct) =====
DROP POLICY IF EXISTS "collabs public read accepted" ON public.song_collaborators;

DROP VIEW IF EXISTS public.public_song_collaborators;
CREATE VIEW public.public_song_collaborators WITH (security_invoker = true) AS
SELECT id, song_id, artist_id, role, accepted, created_at
FROM public.song_collaborators
WHERE accepted = true;
GRANT SELECT ON public.public_song_collaborators TO anon, authenticated;

ALTER TABLE public.song_collaborators DROP CONSTRAINT IF EXISTS song_collaborators_split_pct_check;
ALTER TABLE public.song_collaborators ADD CONSTRAINT song_collaborators_split_pct_check CHECK (split_pct >= 0 AND split_pct <= 100);
ALTER TABLE public.label_artists DROP CONSTRAINT IF EXISTS label_artists_royalty_pct_check;
ALTER TABLE public.label_artists ADD CONSTRAINT label_artists_royalty_pct_check CHECK (royalty_pct >= 0 AND royalty_pct <= 100);

-- ===== balances =====
CREATE OR REPLACE FUNCTION public.get_artist_available_balance(artist_uuid UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total_earned NUMERIC; total_paid NUMERIC; available NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO total_earned FROM revenue_splits WHERE artist_id = artist_uuid AND payee_role = 'artist';
  SELECT COALESCE(SUM(amount),0) INTO total_paid FROM payouts WHERE artist_id = artist_uuid AND status IN ('completed','pending');
  available := total_earned - total_paid;
  IF available < 0 THEN available := 0; END IF;
  RETURN available;
END; $$;

CREATE OR REPLACE FUNCTION public.get_label_available_balance(label_uuid UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total_earned NUMERIC; total_paid NUMERIC; available NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO total_earned FROM revenue_splits WHERE label_id = label_uuid AND payee_role = 'label';
  SELECT COALESCE(SUM(amount),0) INTO total_paid FROM payouts WHERE label_id = label_uuid AND status IN ('completed','pending');
  available := total_earned - total_paid;
  IF available < 0 THEN available := 0; END IF;
  RETURN available;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_artist_available_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_label_available_balance(uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_amount_positive;
ALTER TABLE public.payouts ADD CONSTRAINT payouts_amount_positive CHECK (amount > 0);
ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_amount_reasonable;
ALTER TABLE public.payouts ADD CONSTRAINT payouts_amount_reasonable CHECK (amount <= 1000000);

CREATE OR REPLACE FUNCTION public.audit_payout_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE available_balance NUMERIC; v_artist_user UUID; label_owner_id UUID;
BEGIN
  IF NEW.artist_id IS NOT NULL THEN
    available_balance := get_artist_available_balance(NEW.artist_id);
    SELECT user_id INTO v_artist_user FROM artists WHERE id = NEW.artist_id;
    IF NEW.amount > available_balance THEN
      INSERT INTO audit_log (actor_id, action, target_type, target_id, meta)
      VALUES (v_artist_user, 'payout.request.excessive', 'payout', NEW.id,
        jsonb_build_object('requested', NEW.amount, 'available', available_balance, 'excess', NEW.amount - available_balance));
    END IF;
  ELSIF NEW.label_id IS NOT NULL THEN
    available_balance := get_label_available_balance(NEW.label_id);
    SELECT owner_user_id INTO label_owner_id FROM labels WHERE id = NEW.label_id;
    IF NEW.amount > available_balance THEN
      INSERT INTO audit_log (actor_id, action, target_type, target_id, meta)
      VALUES (label_owner_id, 'payout.request.excessive', 'payout', NEW.id,
        jsonb_build_object('requested', NEW.amount, 'available', available_balance, 'excess', NEW.amount - available_balance));
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.audit_payout_request() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_payout_request_trigger ON public.payouts;
CREATE TRIGGER audit_payout_request_trigger BEFORE INSERT ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.audit_payout_request();

-- ===== public audio fallback =====
DROP POLICY IF EXISTS "song-audio public read for approved songs" ON storage.objects;
CREATE POLICY "song-audio public read for approved songs" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'song-audio'
    AND EXISTS (SELECT 1 FROM public.songs WHERE songs.audio_url = name AND songs.status = 'approved')
  );

DROP POLICY IF EXISTS "song-audio_entitled_read" ON storage.objects;
CREATE POLICY "song-audio_entitled_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'song-audio'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.songs s
        LEFT JOIN public.purchases p_song ON p_song.user_id = auth.uid() AND p_song.song_id = s.id
        LEFT JOIN public.purchases p_album ON p_album.user_id = auth.uid() AND p_album.album_id = s.album_id
        WHERE s.audio_url = objects.name AND (p_song.id IS NOT NULL OR p_album.id IS NOT NULL)
      )
      OR EXISTS (
        SELECT 1 FROM public.subscriptions sub
        WHERE sub.user_id = auth.uid() AND sub.status = 'active'
          AND (sub.expires_at IS NULL OR sub.expires_at > now())
      )
    )
  );

-- ===== artist followers =====
CREATE TABLE public.artist_followers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, artist_id)
);
CREATE INDEX idx_artist_followers_artist ON public.artist_followers(artist_id);
CREATE INDEX idx_artist_followers_user ON public.artist_followers(user_id);
GRANT SELECT, INSERT, DELETE ON public.artist_followers TO authenticated;
GRANT ALL ON public.artist_followers TO service_role;
ALTER TABLE public.artist_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own follow rows" ON public.artist_followers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can follow" ON public.artist_followers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unfollow their own" ON public.artist_followers
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_artist_follower_count(_artist_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.artist_followers WHERE artist_id = _artist_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_artist_follower_count(uuid) TO anon, authenticated;

-- ===== profiles tighten =====
DROP POLICY IF EXISTS "Profiles self or artist read" ON public.profiles;
DROP POLICY IF EXISTS "Profiles self or staff read" ON public.profiles;
CREATE POLICY "Profiles self or staff read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- ===== library tables =====
CREATE TABLE IF NOT EXISTS public.saved_tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, song_id)
);
CREATE INDEX IF NOT EXISTS saved_tracks_user_idx ON public.saved_tracks(user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.saved_tracks TO authenticated;
GRANT ALL ON public.saved_tracks TO service_role;
ALTER TABLE public.saved_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own saved tracks" ON public.saved_tracks
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.play_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  played_at timestamptz NOT NULL DEFAULT now(),
  progress_seconds integer NOT NULL DEFAULT 0
);
CREATE INDEX play_history_user_played_idx ON public.play_history(user_id, played_at DESC);
CREATE INDEX play_history_user_song_idx ON public.play_history(user_id, song_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.play_history TO authenticated;
GRANT ALL ON public.play_history TO service_role;
ALTER TABLE public.play_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own play history" ON public.play_history
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.saved_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, album_id)
);
CREATE INDEX saved_albums_user_idx ON public.saved_albums(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_albums TO authenticated;
GRANT ALL ON public.saved_albums TO service_role;
ALTER TABLE public.saved_albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own saved albums" ON public.saved_albums
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== payment methods (Lenco v2 operator codes) =====
INSERT INTO public.payment_methods (code, label, category, lenco_operator, is_enabled, sort_order)
VALUES
  ('mtn_momo',     'MTN Mobile Money',    'mobile_money', 'mtn',    true, 10),
  ('airtel_money', 'Airtel Money',        'mobile_money', 'airtel', true, 20),
  ('zamtel_kwacha','Zamtel Kwacha',       'mobile_money', 'zamtel', true, 30),
  ('card',         'Debit / Credit Card', 'card',         NULL,     true, 40)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label, category = EXCLUDED.category,
      lenco_operator = EXCLUDED.lenco_operator, is_enabled = EXCLUDED.is_enabled,
      sort_order = EXCLUDED.sort_order;

-- ===== client-side transaction creation =====
GRANT INSERT, UPDATE ON public.payment_transactions TO authenticated;
DROP POLICY IF EXISTS "Users insert own transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users update own pending transactions" ON public.payment_transactions;
CREATE POLICY "Users insert own transactions" ON public.payment_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own pending transactions" ON public.payment_transactions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

UPDATE public.songs s SET status = 'approved'
FROM public.artists a
WHERE s.artist_id = a.id AND s.status = 'pending' AND a.status = 'approved' AND a.verified = true;