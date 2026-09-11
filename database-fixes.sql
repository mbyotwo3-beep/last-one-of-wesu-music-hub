-- ============================================
-- Database Fixes for Wesu+ Music Platform
-- Run these in Supabase SQL Editor
-- ============================================

-- 1-4. Add unique constraints safely if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_tracks_user_song_unique'
  ) THEN
    ALTER TABLE public.saved_tracks 
    ADD CONSTRAINT saved_tracks_user_song_unique 
    UNIQUE (user_id, song_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_albums_user_album_unique'
  ) THEN
    ALTER TABLE public.saved_albums 
    ADD CONSTRAINT saved_albums_user_album_unique 
    UNIQUE (user_id, album_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'artist_followers_user_artist_unique'
  ) THEN
    ALTER TABLE public.artist_followers 
    ADD CONSTRAINT artist_followers_user_artist_unique 
    UNIQUE (user_id, artist_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'playlist_songs_playlist_song_unique'
  ) THEN
    ALTER TABLE public.playlist_songs 
    ADD CONSTRAINT playlist_songs_playlist_song_unique 
    UNIQUE (playlist_id, song_id);
  END IF;
END $$;

-- Ensure release_date columns exist
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS release_date date;
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS release_date date;

-- 5. Ensure the increment_play_count function exists and has proper permissions
CREATE OR REPLACE FUNCTION public.increment_play_count(_song_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.songs SET play_count = play_count + 1 WHERE id = _song_id;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_play_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_play_count(uuid) TO authenticated, anon;

-- 6. Add index for better performance on saved_tracks queries
CREATE INDEX IF NOT EXISTS idx_saved_tracks_user_song 
ON public.saved_tracks (user_id, song_id);

-- 7. Add index for better performance on artist_followers queries
CREATE INDEX IF NOT EXISTS idx_artist_followers_user_artist 
ON public.artist_followers (user_id, artist_id);

-- 8. Add index for better performance on playlist_songs queries
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_position 
ON public.playlist_songs (playlist_id, position);

-- 9. Ensure RLS is enabled on all tables
ALTER TABLE public.saved_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_history ENABLE ROW LEVEL SECURITY;

-- 10. Add RLS policies for saved_tracks (idempotent with DROP POLICY IF EXISTS)
DROP POLICY IF EXISTS "Users can view their own saved tracks" ON public.saved_tracks;
CREATE POLICY "Users can view their own saved tracks"
ON public.saved_tracks FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own saved tracks" ON public.saved_tracks;
CREATE POLICY "Users can insert their own saved tracks"
ON public.saved_tracks FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own saved tracks" ON public.saved_tracks;
CREATE POLICY "Users can delete their own saved tracks"
ON public.saved_tracks FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 11. Add RLS policies for saved_albums
DROP POLICY IF EXISTS "Users can view their own saved albums" ON public.saved_albums;
CREATE POLICY "Users can view their own saved albums"
ON public.saved_albums FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own saved albums" ON public.saved_albums;
CREATE POLICY "Users can insert their own saved albums"
ON public.saved_albums FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own saved albums" ON public.saved_albums;
CREATE POLICY "Users can delete their own saved albums"
ON public.saved_albums FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 12. Add RLS policies for artist_followers
DROP POLICY IF EXISTS "Users can view their own follows" ON public.artist_followers;
CREATE POLICY "Users can view their own follows"
ON public.artist_followers FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own follows" ON public.artist_followers;
CREATE POLICY "Users can insert their own follows"
ON public.artist_followers FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own follows" ON public.artist_followers;
CREATE POLICY "Users can delete their own follows"
ON public.artist_followers FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can view follow counts" ON public.artist_followers;
CREATE POLICY "Anyone can view follow counts"
ON public.artist_followers FOR SELECT
TO authenticated, anon
USING (true);

-- 13. Add RLS policies for playlist_songs
DROP POLICY IF EXISTS "Users can view songs in their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can view songs in their own playlists"
ON public.playlist_songs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.playlists 
    WHERE playlists.id = playlist_songs.playlist_id 
    AND playlists.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert songs into their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can insert songs into their own playlists"
ON public.playlist_songs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.playlists 
    WHERE playlists.id = playlist_songs.playlist_id 
    AND playlists.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete songs from their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can delete songs from their own playlists"
ON public.playlist_songs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.playlists 
    WHERE playlists.id = playlist_songs.playlist_id 
    AND playlists.user_id = auth.uid()
  )
);

-- 14. Add RLS policies for play_history
DROP POLICY IF EXISTS "Users can view their own play history" ON public.play_history;
CREATE POLICY "Users can view their own play history"
ON public.play_history FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own play history" ON public.play_history;
CREATE POLICY "Users can insert their own play history"
ON public.play_history FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 15. Ensure payment_transactions table has proper index
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_status 
ON public.payment_transactions (user_id, status);

-- 16. Add index for purchases table
CREATE INDEX IF NOT EXISTS idx_purchases_user_item 
ON public.purchases (user_id, song_id, album_id);

-- 17. Add index for songs table for better query performance
CREATE INDEX IF NOT EXISTS idx_songs_artist_status 
ON public.songs (artist_id, status);

CREATE INDEX IF NOT EXISTS idx_songs_album_status 
ON public.songs (album_id, status);

-- 18. Add index for albums table
CREATE INDEX IF NOT EXISTS idx_albums_artist_status 
ON public.albums (artist_id, status);

-- 19. Add index for artists table
CREATE INDEX IF NOT EXISTS idx_artists_status 
ON public.artists (status);

-- 20. Verify all storage buckets have proper RLS policies
-- (These should be configured in Supabase Dashboard > Storage)
-- For album-art, artist-images, user-avatars, hero-images, label-images: Make PUBLIC
-- For song-audio: Keep PRIVATE with RLS policies

-- ============================================
-- Verification Queries (run these to verify)
-- ============================================

-- Check unique constraints
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name
FROM pg_constraint 
WHERE conrelid::regclass IN ('saved_tracks', 'saved_albums', 'artist_followers', 'playlist_songs')
AND contype = 'u';

-- Check RLS is enabled
SELECT 
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('saved_tracks', 'saved_albums', 'artist_followers', 'playlist_songs', 'play_history');

-- Check indexes
SELECT 
  tablename,
  indexname
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN ('saved_tracks', 'saved_albums', 'artist_followers', 'playlist_songs', 'play_history', 'payment_transactions', 'purchases', 'songs', 'albums', 'artists');
