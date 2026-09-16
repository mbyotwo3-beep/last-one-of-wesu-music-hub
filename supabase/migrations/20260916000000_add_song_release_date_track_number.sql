-- The app's upload / album-edit flows write songs.release_date and
-- songs.track_number, but the columns were never created — every song upload
-- and any track edit that sets a track number fails with a 400 from PostgREST.
-- Pure ADD COLUMN: backward compatible, no data touched.
ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS release_date date NULL,
  ADD COLUMN IF NOT EXISTS track_number integer NULL;

-- Helpful index for album tracklist ordering.
CREATE INDEX IF NOT EXISTS songs_album_track_idx
  ON public.songs (album_id, track_number);
