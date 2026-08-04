-- 1) Replace the over-broad public read on song-audio with a free-songs-only policy
DROP POLICY IF EXISTS "song-audio public read for approved songs" ON storage.objects;

CREATE POLICY "song-audio public read for free approved songs"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'song-audio'
  AND EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.audio_url = storage.objects.name
      AND s.status = 'approved'
      AND COALESCE(s.price, 0) = 0
  )
);

-- 2) Fix broken owner-path checks (they parsed artists.name instead of the object path)
DROP POLICY IF EXISTS "album-art artists upload" ON storage.objects;
DROP POLICY IF EXISTS "album-art artists update" ON storage.objects;
DROP POLICY IF EXISTS "album-art artists delete" ON storage.objects;
DROP POLICY IF EXISTS "artist-images own upload" ON storage.objects;
DROP POLICY IF EXISTS "artist-images own update" ON storage.objects;
DROP POLICY IF EXISTS "song-audio artists manage" ON storage.objects;
DROP POLICY IF EXISTS "song-audio artists upload" ON storage.objects;

CREATE POLICY "album-art owner write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'album-art' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "album-art owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'album-art' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'album-art' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "album-art owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'album-art' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "artist-images owner write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'artist-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "artist-images owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'artist-images' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'artist-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "artist-images owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'artist-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "song-audio owner write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'song-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "song-audio owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'song-audio' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'song-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "song-audio owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'song-audio' AND (storage.foldername(name))[1] = auth.uid()::text);