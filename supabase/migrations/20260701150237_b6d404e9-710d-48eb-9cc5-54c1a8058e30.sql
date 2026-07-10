-- profiles
DROP POLICY IF EXISTS "Profiles are readable by all"       ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by all users" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- platform_settings
DROP POLICY IF EXISTS "Public read settings" ON public.platform_settings;
CREATE POLICY "Staff read settings" ON public.platform_settings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
REVOKE SELECT ON public.platform_settings FROM anon;

-- artists.feature_rate hidden from clients
REVOKE SELECT (feature_rate) ON public.artists FROM anon;
REVOKE SELECT (feature_rate) ON public.artists FROM authenticated;

-- labels.contact_email hidden from anon
REVOKE SELECT (contact_email) ON public.labels FROM anon;

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

-- song-audio bucket: require purchase or subscription
DROP POLICY IF EXISTS "song-audio_auth_read" ON storage.objects;
CREATE POLICY "song-audio_entitled_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'song-audio' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.songs s
        LEFT JOIN public.purchases p_song
          ON p_song.user_id = auth.uid() AND p_song.song_id  = s.id
        LEFT JOIN public.purchases p_album
          ON p_album.user_id = auth.uid() AND p_album.album_id = s.album_id
        WHERE s.audio_url LIKE '%' || storage.objects.name
          AND (p_song.id IS NOT NULL OR p_album.id IS NOT NULL)
      )
      OR EXISTS (
        SELECT 1 FROM public.subscriptions sub
        WHERE sub.user_id = auth.uid()
          AND sub.status = 'active'
          AND (sub.expires_at IS NULL OR sub.expires_at > now())
      )
    )
  );

-- SECURITY DEFINER function EXECUTE hardening
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_label_owner(uuid, uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_song_collaborator(uuid, uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_user_id(uuid)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_play_count(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_revenue_splits()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_artist_moderation()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_payout_decision()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_song_moderation()          FROM PUBLIC, anon, authenticated;