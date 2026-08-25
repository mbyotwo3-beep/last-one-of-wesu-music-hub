-- Subscriptions are paused: paid audio may be read only by its owner, staff,
-- a buyer of the individual song, or a buyer of the containing album.
DROP POLICY IF EXISTS "song-audio_entitled_read" ON storage.objects;

CREATE POLICY "song-audio_entitled_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'song-audio'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
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
  )
);
