COMMENT ON COLUMN public.artists.status IS 'Artist moderation status: pending (awaiting review), approved (visible on platform), rejected (application denied)';
CREATE INDEX IF NOT EXISTS idx_artists_status ON public.artists(status);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artists_status_check') THEN
    ALTER TABLE public.artists ADD CONSTRAINT artists_status_check CHECK (status IN ('pending','approved','rejected'));
  END IF;
END $$;

-- profiles
DROP POLICY IF EXISTS "Profiles are readable by all"       ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by all users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles self or artist read" ON public.profiles;
CREATE POLICY "Profiles self or artist read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.artists a WHERE a.user_id = profiles.user_id AND a.status = 'approved')
    OR public.is_staff(auth.uid())
  );
REVOKE SELECT ON public.profiles FROM anon;

-- platform_settings
DROP POLICY IF EXISTS "Public read settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Staff read settings" ON public.platform_settings;
CREATE POLICY "Staff read settings" ON public.platform_settings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
REVOKE SELECT ON public.platform_settings FROM anon;

REVOKE SELECT (feature_rate) ON public.artists FROM anon, authenticated;
REVOKE SELECT (contact_email) ON public.labels FROM anon, authenticated;
REVOKE SELECT (to_email) ON public.invitations FROM anon, authenticated;

-- user_roles: staff-only writes
DROP POLICY IF EXISTS "Staff insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff delete roles" ON public.user_roles;
CREATE POLICY "Staff insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- song-audio entitlement
DROP POLICY IF EXISTS "song-audio_auth_read" ON storage.objects;
DROP POLICY IF EXISTS "song-audio_entitled_read" ON storage.objects;
CREATE POLICY "song-audio_entitled_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'song-audio' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.songs s
        LEFT JOIN public.purchases p_song ON p_song.user_id = auth.uid() AND p_song.song_id  = s.id
        LEFT JOIN public.purchases p_album ON p_album.user_id = auth.uid() AND p_album.album_id = s.album_id
        WHERE s.audio_url LIKE '%' || storage.objects.name
          AND (p_song.id IS NOT NULL OR p_album.id IS NOT NULL)
      )
      OR EXISTS (
        SELECT 1 FROM public.subscriptions sub
        WHERE sub.user_id = auth.uid() AND sub.status = 'active'
          AND (sub.expires_at IS NULL OR sub.expires_at > now())
      )
    )
  );

-- albums moderation
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
DROP POLICY IF EXISTS "Albums are public" ON public.albums;
DROP POLICY IF EXISTS "Albums approved public" ON public.albums;
CREATE POLICY "Albums approved public" ON public.albums
  FOR SELECT TO anon, authenticated
  USING (status = 'approved'
         OR EXISTS (SELECT 1 FROM public.artists a WHERE a.id = albums.artist_id AND a.user_id = auth.uid())
         OR public.is_staff(auth.uid()));

-- lock down client writes on money tables
DROP POLICY IF EXISTS "Users can create own purchases" ON public.purchases;
REVOKE INSERT, UPDATE, DELETE ON public.purchases FROM anon, authenticated;
DROP POLICY IF EXISTS "Users insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users update own subscription" ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;
DROP POLICY IF EXISTS "Users create own transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users update own transactions" ON public.payment_transactions;
REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM anon, authenticated;

-- song_likes owner-only read
DROP POLICY IF EXISTS "Anyone reads like counts" ON public.song_likes;
DROP POLICY IF EXISTS "Users read own likes" ON public.song_likes;
CREATE POLICY "Users read own likes" ON public.song_likes FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE SELECT ON public.song_likes FROM anon;

-- label roster guard
CREATE OR REPLACE FUNCTION public.label_artists_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF public.is_label_owner(auth.uid(), NEW.label_id) OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.royalty_pct IS DISTINCT FROM OLD.royalty_pct
     OR NEW.label_id IS DISTINCT FROM OLD.label_id
     OR NEW.artist_id IS DISTINCT FROM OLD.artist_id THEN
    RAISE EXCEPTION 'Only the label owner can change royalty_pct/label_id/artist_id';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_label_artists_guard ON public.label_artists;
CREATE TRIGGER trg_label_artists_guard BEFORE UPDATE ON public.label_artists
  FOR EACH ROW EXECUTE FUNCTION public.label_artists_guard();

ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS cover_url text;

-- auto-grant artist role
CREATE OR REPLACE FUNCTION public.grant_artist_role_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'artist'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.grant_artist_role_on_approval() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_grant_artist_role ON public.artists;
CREATE TRIGGER trg_grant_artist_role AFTER INSERT OR UPDATE OF status ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.grant_artist_role_on_approval();
INSERT INTO public.user_roles (user_id, role)
SELECT a.user_id, 'artist'::app_role FROM public.artists a
WHERE a.status = 'approved' AND a.user_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- role helper execute grants (needed by RLS policies)
REVOKE EXECUTE ON FUNCTION public.handle_new_user()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_revenue_splits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_split_total()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_label_owner(uuid, uuid)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_song_collaborator(uuid, uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_user_id(uuid)              TO anon, authenticated;

-- lenco operator codes
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS lenco_operator text;
UPDATE public.payment_methods SET lenco_operator = 'mtn-zambia'    WHERE code = 'mtn_momo';
UPDATE public.payment_methods SET lenco_operator = 'airtel-zambia' WHERE code = 'airtel_money';
UPDATE public.payment_methods SET lenco_operator = 'zamtel-zambia' WHERE code = 'zamtel_kwacha';
ALTER TABLE public.payment_transactions ALTER COLUMN provider SET DEFAULT 'lenco';