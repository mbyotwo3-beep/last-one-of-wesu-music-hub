-- Payment records are created and settled only by trusted server-side code.
-- A browser must never be able to mark a transaction or entitlement completed.
REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM anon, authenticated;
DROP POLICY IF EXISTS "Users create own transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users update own transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users insert own transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users update own pending transactions" ON public.payment_transactions;

REVOKE INSERT, UPDATE, DELETE ON public.purchases FROM anon, authenticated;
DROP POLICY IF EXISTS "Users can create own purchases" ON public.purchases;

-- Subscription sales are paused. New payment transactions may only represent
-- one song or one album. NOT VALID preserves historical rows while enforcing
-- the rule for every new or changed record.
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_item_type_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_item_type_check
  CHECK (item_type IN ('song', 'album')) NOT VALID;

-- These are the exact completed-purchase lookups made by the entitlement
-- policy and the listener. Partial indexes keep them fast as sales grow.
CREATE INDEX IF NOT EXISTS purchases_completed_song_entitlement_idx
  ON public.purchases (user_id, song_id)
  WHERE status = 'completed' AND song_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchases_completed_album_entitlement_idx
  ON public.purchases (user_id, album_id)
  WHERE status = 'completed' AND album_id IS NOT NULL;

-- A pending purchase is not an entitlement. Keep the storage policy aligned
-- with the server-side entitlement check in getSignedAudioUrl.
DROP POLICY IF EXISTS "song-audio_entitled_read" ON storage.objects;
CREATE POLICY "song-audio_entitled_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'song-audio'
  AND (
    (storage.foldername(name))[1] = (select auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (select auth.uid())
        AND ur.role::text IN ('admin', 'superadmin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.songs s
      LEFT JOIN public.purchases p_song
        ON p_song.user_id = (select auth.uid())
        AND p_song.song_id = s.id
        AND p_song.status = 'completed'
      LEFT JOIN public.purchases p_album
        ON p_album.user_id = (select auth.uid())
        AND p_album.album_id = s.album_id
        AND p_album.status = 'completed'
      WHERE s.audio_url = objects.name
        AND (p_song.id IS NOT NULL OR p_album.id IS NOT NULL)
    )
  )
);

-- Paid previews are signed server-side. Anonymous/authenticated Storage reads
-- are limited to approved free songs; otherwise this policy would bypass the
-- purchase check above by exposing the original audio object.
DROP POLICY IF EXISTS "song-audio public read for approved songs" ON storage.objects;
DROP POLICY IF EXISTS "song-audio public read free songs" ON storage.objects;
CREATE POLICY "song-audio public read free songs" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'song-audio'
    AND EXISTS (
      SELECT 1
      FROM public.songs s
      WHERE s.audio_url = objects.name
        AND s.status = 'approved'
        AND COALESCE(s.price, 0) <= 0
    )
  );
