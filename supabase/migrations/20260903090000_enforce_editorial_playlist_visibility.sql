-- Listener and artist playlists are private by default and cannot be made
-- public by a direct client request. Only a playlist owned by Wesu+ staff is
-- eligible to be an editorial/public playlist.

-- Preserve the rule for old data as well. A user who is not currently staff
-- cannot leave a public playlist behind from the former unrestricted policy.
UPDATE public.playlists AS playlist
SET is_public = false
WHERE playlist.is_public = true
  AND NOT private.is_staff(playlist.user_id);

DROP POLICY IF EXISTS "Users can read public playlists" ON public.playlists;
CREATE POLICY "Anyone can read editorial playlists"
  ON public.playlists
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true AND private.is_staff(user_id));

-- The previous owner policy allowed every owner to set is_public = true.
-- WITH CHECK is evaluated on INSERT and UPDATE, so this protects both normal
-- app writes and someone calling the Data API directly.
DROP POLICY IF EXISTS "Users can manage own playlists" ON public.playlists;
CREATE POLICY "Users can manage own playlists"
  ON public.playlists
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (is_public = false OR private.is_staff(auth.uid()))
  );

DROP POLICY IF EXISTS "Users can read public playlist songs" ON public.playlist_songs;
CREATE POLICY "Anyone can read editorial playlist songs"
  ON public.playlist_songs
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.playlists AS playlist
      WHERE playlist.id = playlist_songs.playlist_id
        AND playlist.is_public = true
        AND private.is_staff(playlist.user_id)
    )
  );
