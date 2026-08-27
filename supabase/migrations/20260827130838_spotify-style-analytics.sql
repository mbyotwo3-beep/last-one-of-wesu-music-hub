-- Spotify-style analytics use the existing play_history event stream.
-- Keep reads/writes scoped to the signed-in owner and make the common
-- dashboard queries index-friendly.

ALTER TABLE public.play_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.play_history TO authenticated;

CREATE INDEX IF NOT EXISTS play_history_user_played_at_idx
  ON public.play_history (user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS play_history_song_played_at_idx
  ON public.play_history (song_id, played_at DESC);

CREATE INDEX IF NOT EXISTS play_history_played_at_idx
  ON public.play_history (played_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'play_history'
      AND policyname = 'play_history_owner_select'
  ) THEN
    CREATE POLICY play_history_owner_select
      ON public.play_history FOR SELECT TO authenticated
      USING ((select auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'play_history'
      AND policyname = 'play_history_owner_insert'
  ) THEN
    CREATE POLICY play_history_owner_insert
      ON public.play_history FOR INSERT TO authenticated
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'play_history'
      AND policyname = 'play_history_owner_update'
  ) THEN
    CREATE POLICY play_history_owner_update
      ON public.play_history FOR UPDATE TO authenticated
      USING ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;
END $$;
