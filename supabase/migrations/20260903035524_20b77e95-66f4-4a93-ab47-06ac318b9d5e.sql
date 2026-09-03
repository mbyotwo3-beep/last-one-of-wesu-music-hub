DROP POLICY IF EXISTS "Artists are public" ON public.artists;
CREATE POLICY "Artists are public" ON public.artists
  FOR SELECT TO anon
  USING (status = 'approved');