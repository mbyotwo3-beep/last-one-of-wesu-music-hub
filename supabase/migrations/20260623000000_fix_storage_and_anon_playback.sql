-- =============================================================
-- 1. Fix song-audio storage policies
--    Previous migration used artist_id as folder prefix,
--    but uploadFileToBucket uses user_id as folder prefix.
--    Drop conflicting policies and keep user_id based ones only.
-- =============================================================
DROP POLICY IF EXISTS "song-audio artists manage" ON storage.objects;

-- These were created in the last migration (20260622*) and are correct:
-- song-audio_owner_rw  → uses auth.uid() as folder prefix  ✓
-- song-audio_auth_read → SELECT for authenticated           ✓
-- song-audio_staff_all → staff manage all                   ✓

-- Also drop conflicting album-art / artist-images policies from the early migration
-- that used artist_id prefix (incompatible with user_id prefix in uploadFileToBucket)
DROP POLICY IF EXISTS "album-art artists upload"  ON storage.objects;
DROP POLICY IF EXISTS "album-art artists update"  ON storage.objects;
DROP POLICY IF EXISTS "album-art artists delete"  ON storage.objects;
DROP POLICY IF EXISTS "artist-images own upload"  ON storage.objects;
DROP POLICY IF EXISTS "artist-images own update"  ON storage.objects;

-- The 20260622* migration already created correct user_id-based policies for all buckets.
-- No new policies needed here — just clean up the conflicting ones above.

-- =============================================================
-- 2. Anonymous (unauthenticated) playback support
--    Free songs can be streamed without signing in, but with ads.
--    We need a public server function that returns a signed URL
--    for free songs without requiring auth.
--    This migration adds the supporting column and a public read
--    policy for song metadata so the home/browse pages work anon.
-- =============================================================

-- songs table already has SELECT policy for anon ("Songs are public")
-- so song metadata is already readable by anon users.

-- Add a flag to track whether a song is ad-supported-only
-- (i.e. not purchased and not subscribed = ads shown)
-- This is managed client-side based on auth state — no DB column needed.

-- Allow anon users to see approved songs only
-- (the existing "Songs are public" policy exposes ALL songs including pending/rejected)
-- Replace it with a safer version:
DROP POLICY IF EXISTS "Songs are public" ON public.songs;
DROP POLICY IF EXISTS "Songs approved public" ON public.songs;
DROP POLICY IF EXISTS "Songs authenticated read" ON public.songs;

CREATE POLICY "Songs approved public" ON public.songs
  FOR SELECT TO anon
  USING (status = 'approved');

-- Authenticated users can still see all their own songs regardless of status
CREATE POLICY "Songs authenticated read" ON public.songs
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR EXISTS (SELECT 1 FROM public.artists a WHERE a.id = songs.artist_id AND a.user_id = auth.uid())
    OR public.is_staff(auth.uid())
  );

-- =============================================================
-- 3. Public signed URL function for free songs
--    Called server-side (service_role) — no auth required client-side.
--    The app server checks song.price = 0 before calling this.
-- =============================================================

-- No DB function needed — this is handled in the server function
-- getPublicAudioUrl in listener.functions.ts (added in code below).

-- =============================================================
-- 4. Allow anon to read album-art and artist-images (public art)
-- =============================================================
-- These policies already exist from migration 20260618131532:
--   "album-art read auth"  → SELECT TO authenticated, anon  ✓
--   "artist-images read"   → SELECT TO authenticated, anon  ✓
-- Also created in 20260622* as:
--   "album-art_auth_read"  → SELECT TO authenticated        (missing anon)
--   "artist-images_auth_read" → SELECT TO authenticated     (missing anon)
-- Add anon read for these two buckets via the 20260622* policies:

DROP POLICY IF EXISTS "album-art_auth_read"       ON storage.objects;
DROP POLICY IF EXISTS "artist-images_auth_read"   ON storage.objects;
DROP POLICY IF EXISTS "album-art_public_read"     ON storage.objects;
DROP POLICY IF EXISTS "artist-images_public_read" ON storage.objects;

CREATE POLICY "album-art_public_read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'album-art');

CREATE POLICY "artist-images_public_read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'artist-images');

-- =============================================================
-- 5. Play count increment — safe atomic function callable via RPC
-- =============================================================
CREATE OR REPLACE FUNCTION public.increment_play_count(_song_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.songs SET play_count = play_count + 1 WHERE id = _song_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_play_count(uuid) TO authenticated;
