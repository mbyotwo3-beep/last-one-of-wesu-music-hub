-- Play history: powers the "Recently Played" / "Continue Listening" shelf.
CREATE TABLE public.play_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  played_at timestamptz NOT NULL DEFAULT now(),
  progress_seconds integer NOT NULL DEFAULT 0
);
CREATE INDEX play_history_user_played_idx ON public.play_history(user_id, played_at DESC);
CREATE INDEX play_history_user_song_idx ON public.play_history(user_id, song_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.play_history TO authenticated;
GRANT ALL ON public.play_history TO service_role;

ALTER TABLE public.play_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own play history"
  ON public.play_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Saved albums (parallel to saved_tracks for songs).
CREATE TABLE public.saved_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  album_id uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, album_id)
);
CREATE INDEX saved_albums_user_idx ON public.saved_albums(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_albums TO authenticated;
GRANT ALL ON public.saved_albums TO service_role;

ALTER TABLE public.saved_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own saved albums"
  ON public.saved_albums FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);