
CREATE TABLE public.artist_followers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, artist_id)
);
CREATE INDEX idx_artist_followers_artist ON public.artist_followers(artist_id);
CREATE INDEX idx_artist_followers_user ON public.artist_followers(user_id);

GRANT SELECT ON public.artist_followers TO anon;
GRANT SELECT, INSERT, DELETE ON public.artist_followers TO authenticated;
GRANT ALL ON public.artist_followers TO service_role;

ALTER TABLE public.artist_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follower counts are public" ON public.artist_followers
  FOR SELECT USING (true);
CREATE POLICY "Users can follow" ON public.artist_followers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unfollow their own" ON public.artist_followers
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
