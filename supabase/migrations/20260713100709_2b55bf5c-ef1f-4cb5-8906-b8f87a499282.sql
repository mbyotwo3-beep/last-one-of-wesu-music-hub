
-- 1) Fix SECURITY DEFINER view: recreate public_song_collaborators as security_invoker
DROP VIEW IF EXISTS public.public_song_collaborators;
CREATE VIEW public.public_song_collaborators
  WITH (security_invoker = true) AS
SELECT id, song_id, artist_id, role, accepted, created_at
FROM public.song_collaborators
WHERE accepted = true;
GRANT SELECT ON public.public_song_collaborators TO anon, authenticated;

-- 2) Fix mutable search_path on get_schema_info + restrict execute
CREATE OR REPLACE FUNCTION public.get_schema_info()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN (
    SELECT json_agg(t) FROM (
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    ) t
  );
END;
$function$;

-- 3) Revoke public execute on SECURITY DEFINER functions that are trigger-only or admin-only.
--    Predicate helpers used by RLS policies (has_role, is_staff, is_superadmin,
--    is_label_owner, is_song_collaborator, artist_user_id, get_*_available_balance)
--    remain callable so policies keep working when invoked by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.get_schema_info() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_payout_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_revenue_splits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_artist_role_on_approval() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_artist_moderation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_payout_decision() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_song_moderation() FROM PUBLIC, anon, authenticated;

-- 4) artist_followers: remove public row read; expose only aggregate count via SECURITY DEFINER function.
DROP POLICY IF EXISTS "Follower counts are public" ON public.artist_followers;
CREATE POLICY "Users read own follow rows"
  ON public.artist_followers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_artist_follower_count(_artist_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.artist_followers WHERE artist_id = _artist_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_artist_follower_count(uuid) TO anon, authenticated;

-- 5) profiles: restrict SELECT to self and staff only (remove broad "any approved artist" branch).
--    Public artist info should be read from public.artists, which already exposes safe fields.
DROP POLICY IF EXISTS "Profiles self or artist read" ON public.profiles;
CREATE POLICY "Profiles self or staff read"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- 6) song-audio storage: tighten entitlement check to exact-path match on the requested song.
DROP POLICY IF EXISTS "song-audio_entitled_read" ON storage.objects;
CREATE POLICY "song-audio_entitled_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'song-audio'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.songs s
        LEFT JOIN public.purchases p_song
          ON p_song.user_id = auth.uid() AND p_song.song_id = s.id
        LEFT JOIN public.purchases p_album
          ON p_album.user_id = auth.uid() AND p_album.album_id = s.album_id
        WHERE s.audio_url = objects.name
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
