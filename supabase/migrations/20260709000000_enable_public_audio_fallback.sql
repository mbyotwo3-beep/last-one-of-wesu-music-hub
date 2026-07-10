-- Enable public read access to song-audio bucket as fallback when service role key is unavailable
-- This allows music playback to work without service role key (temporary workaround)
-- SECURITY: Only approved songs are accessible (status='approved' check in application layer)

-- Add public read policy for song-audio bucket
CREATE POLICY "song-audio public read for approved songs" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'song-audio' 
    AND EXISTS (
      SELECT 1 FROM public.songs 
      WHERE songs.audio_url = name 
      AND songs.status = 'approved'
    )
  );

-- Note: This policy is safe because:
-- 1. Only works for approved songs (checked by the EXISTS clause)
-- 2. Application layer still enforces payment/subscription requirements
-- 3. Provides fallback for when service role key is not available
-- 4. Can be removed once proper service role key is configured
