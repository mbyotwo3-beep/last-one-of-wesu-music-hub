-- ============================================================================
-- Unstrand albums whose tracks are already live.
--
-- The shape of the bug: songs and albums are moderated separately, but a
-- public album page only reads status = 'approved'. An artist uploaded a
-- release; a moderator approved the twelve tracks one at a time; the album row
-- was left in 'draft'. Result:
--
--   * 12 tracks played, showed a K150 price, and were individually buyable
--   * /albums/<id> returned 404 for every listener
--   * the album was absent from the admin queue, which filtered
--     status = 'pending' and so could never surface or approve it
--
-- Nothing was wrong with the content — only the container was unpublished.
--
-- This promotes exactly those albums: every track on the album is already
-- 'approved', so each has been reviewed and the album carries no content of its
-- own to review. An album with ANY track not approved is deliberately left
-- alone, so a half-reviewed release still waits for a human.
--
-- Idempotent: re-running promotes nothing further.
-- ============================================================================

DO $$
DECLARE
  promoted integer := 0;
BEGIN
  WITH candidates AS (
    SELECT a.id
    FROM public.albums a
    WHERE a.status <> 'approved'
      AND EXISTS (SELECT 1 FROM public.songs s WHERE s.album_id = a.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.songs s
        WHERE s.album_id = a.id AND s.status IS DISTINCT FROM 'approved'
      )
  ),
  upd AS (
    UPDATE public.albums a
    SET status = 'approved'
    FROM candidates c
    WHERE a.id = c.id
    RETURNING a.id, a.title
  )
  SELECT count(*) INTO promoted FROM upd;

  RAISE NOTICE 'Unstranded % album(s): every track on them was already approved.', promoted;
END $$;