
-- 1. payment_transactions: remove client INSERT/UPDATE policies
DROP POLICY IF EXISTS "Users create own transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users update own transactions" ON public.payment_transactions;
REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM anon, authenticated;

-- 2. song_likes: only owner sees own likes (aggregate counts must go via a
--    server function using service role).
DROP POLICY IF EXISTS "Anyone reads like counts" ON public.song_likes;
CREATE POLICY "Users read own likes"
  ON public.song_likes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
REVOKE SELECT ON public.song_likes FROM anon;

-- 3. invitations.to_email: hide from Data API entirely; server code uses
--    service role when it needs the address.
REVOKE SELECT (to_email) ON public.invitations FROM anon, authenticated;

-- 4. labels.contact_email: hide from Data API; owners/admins read via server fns.
REVOKE SELECT (contact_email) ON public.labels FROM anon, authenticated;

-- 5. label_artists: attach guard trigger so artist-initiated updates cannot
--    change royalty_pct / label_id / artist_id.
DROP TRIGGER IF EXISTS trg_label_artists_guard ON public.label_artists;
CREATE TRIGGER trg_label_artists_guard
  BEFORE UPDATE ON public.label_artists
  FOR EACH ROW EXECUTE FUNCTION public.label_artists_guard();
