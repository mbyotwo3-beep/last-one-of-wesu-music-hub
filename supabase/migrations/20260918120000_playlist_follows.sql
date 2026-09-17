-- Spotify-style followed playlists: listeners can save other users'
-- public playlists into their own library.
CREATE TABLE IF NOT EXISTS public.saved_playlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT saved_playlists_pkey PRIMARY KEY (id),
  CONSTRAINT saved_playlists_unique UNIQUE (user_id, playlist_id)
);

ALTER TABLE public.saved_playlists ENABLE ROW LEVEL SECURITY;

-- Owners manage their own follows; anyone can count follows on public lists.
DROP POLICY IF EXISTS "saved_playlists_owner_all" ON public.saved_playlists;
CREATE POLICY "saved_playlists_owner_all" ON public.saved_playlists
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "saved_playlists_public_read" ON public.saved_playlists;
CREATE POLICY "saved_playlists_public_read" ON public.saved_playlists
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = saved_playlists.playlist_id AND p.is_public = true
    )
  );

CREATE INDEX IF NOT EXISTS saved_playlists_user_idx
  ON public.saved_playlists (user_id);
CREATE INDEX IF NOT EXISTS saved_playlists_playlist_idx
  ON public.saved_playlists (playlist_id);
