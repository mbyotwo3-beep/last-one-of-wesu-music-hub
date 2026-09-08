-- Fix artist-images storage policies to use user_id instead of artist_id
-- The uploadFileToBucket function uses user_id as folder prefix, but the policies
-- were checking for artist_id, causing RLS violations when artists upload avatars.

-- Drop old artist-images policies that used artist_id
DROP POLICY IF EXISTS "artist-images own upload" ON storage.objects;
DROP POLICY IF EXISTS "artist-images own update" ON storage.objects;
DROP POLICY IF EXISTS "artist-images owner write" ON storage.objects;
DROP POLICY IF EXISTS "artist-images owner update" ON storage.objects;
DROP POLICY IF EXISTS "artist-images owner delete" ON storage.objects;
DROP POLICY IF EXISTS "artist-images staff all" ON storage.objects;

-- Create new policies that use user_id folder structure (matching uploadFileToBucket)
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

-- Add staff policies for artist-images
CREATE POLICY "artist-images staff all"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'artist-images')
WITH CHECK (bucket_id = 'artist-images');
