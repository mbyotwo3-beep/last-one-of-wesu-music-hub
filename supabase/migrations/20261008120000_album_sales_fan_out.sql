-- Album sales must fan out per track, not allocate as one lump sum.
--
-- An album purchase previously settled as a single `purchases` row with
-- album_id set and song_id NULL. The revenue trigger's album branch therefore
-- left v_song_id NULL, which meant:
--
--   * the collaborator sum (gated on `v_song_id IS NOT NULL`) never ran, so
--     every accepted song_collaborators row on the album's tracks was paid
--     nothing on every album sale, and
--   * 100% of the post-platform, post-label pool went to albums.artist_id.
--
-- fulfilment now writes one purchases row + one completed child 'song'
-- transaction per track (see src/lib/payments.server.ts fulfillAlbum). Those
-- children carry a song_id, so the trigger allocates correctly per track and
-- pays each collaborator their agreed share exactly once.
--
-- That makes the album parent transaction a receipt only — the same treatment
-- the playlist bundle parent already got. Without this the parent would also
-- allocate, and every album would pay its owner twice.
--
-- The rest of the function is copied verbatim from 20260916120000, including
-- SECURITY DEFINER and the search_path pin. Only the bundle-receipt branch and
-- the album lookup branch change.

CREATE OR REPLACE FUNCTION public.compute_revenue_splits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_song_id uuid;
  v_artist_id uuid;
  v_artist_user uuid;
  v_platform_pct numeric := 20;
  v_platform_amount numeric;
  v_post_platform_pool numeric;
  v_label_id uuid;
  v_label_owner uuid;
  v_artist_royalty_pct numeric;
  v_label_amount numeric := 0;
  v_distributable_pool numeric;
  v_total_collab_pct numeric := 0;
  v_main_pct numeric := 100;
  collab record;
BEGIN
  IF NEW.status <> 'completed'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  -- Bundle parents (playlist unlock, album) are receipts only. Their per-song
  -- child transactions are what allocate revenue, so paying here as well would
  -- double-count every sale.
  IF NEW.item_type IN ('playlist', 'album') THEN
    RETURN NEW;
  END IF;

  IF NEW.item_type = 'song' THEN
    SELECT s.id, s.artist_id
      INTO v_song_id, v_artist_id
      FROM public.songs s
      WHERE s.id = NEW.item_id;
  ELSE
    RAISE EXCEPTION 'Unsupported payment transaction item type: %', NEW.item_type;
  END IF;

  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Cannot allocate revenue for missing item %', NEW.item_id;
  END IF;

  SELECT COALESCE(
    NULLIF((
      SELECT ps.value ->> 'commission_pct'
      FROM public.platform_settings ps
      WHERE ps.key = 'site'
    ), '')::numeric,
    (
      SELECT CASE
        WHEN jsonb_typeof(ps.value) = 'number' THEN ps.value::text::numeric
        ELSE NULLIF(ps.value ->> 'commission_pct', '')::numeric
      END
      FROM public.platform_settings ps
      WHERE ps.key = 'commission_pct'
      LIMIT 1
    ),
    20
  )
    INTO v_platform_pct;
  v_platform_pct := LEAST(GREATEST(COALESCE(v_platform_pct, 20), 0), 100);

  DELETE FROM public.revenue_splits WHERE transaction_id = NEW.id;

  v_platform_amount := round(NEW.amount * v_platform_pct / 100, 2);
  v_post_platform_pool := NEW.amount - v_platform_amount;
  INSERT INTO public.revenue_splits (transaction_id, payee_role, amount, pct)
  VALUES (NEW.id, 'platform', v_platform_amount, v_platform_pct);

  SELECT la.label_id, l.owner_user_id, la.royalty_pct
    INTO v_label_id, v_label_owner, v_artist_royalty_pct
    FROM public.artists a
    JOIN public.label_artists la
      ON la.artist_id = a.id
     AND la.label_id = a.label_id
     AND la.status = 'active'
    JOIN public.labels l
      ON l.id = la.label_id
     AND l.status = 'approved'
    WHERE a.id = v_artist_id
    ORDER BY la.created_at DESC
    LIMIT 1;

  v_distributable_pool := v_post_platform_pool;
  IF v_label_id IS NOT NULL THEN
    v_artist_royalty_pct := LEAST(GREATEST(COALESCE(v_artist_royalty_pct, 85), 0), 100);
    v_label_amount := round(v_post_platform_pool * (100 - v_artist_royalty_pct) / 100, 2);
    v_distributable_pool := v_post_platform_pool - v_label_amount;
    INSERT INTO public.revenue_splits
      (transaction_id, payee_user_id, payee_role, label_id, amount, pct)
    VALUES
      (NEW.id, v_label_owner, 'label', v_label_id, v_label_amount, 100 - v_artist_royalty_pct);
  END IF;

  SELECT a.user_id INTO v_artist_user
  FROM public.artists a
  WHERE a.id = v_artist_id;

  IF v_song_id IS NOT NULL THEN
    SELECT COALESCE(SUM(sc.split_pct), 0)
      INTO v_total_collab_pct
      FROM public.song_collaborators sc
      WHERE sc.song_id = v_song_id
        AND sc.accepted = true
        AND sc.role <> 'main';
    v_main_pct := LEAST(GREATEST(100 - v_total_collab_pct, 0), 100);
  END IF;

  IF v_main_pct > 0 THEN
    INSERT INTO public.revenue_splits
      (transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
    VALUES
      (NEW.id, v_artist_user, 'artist', v_artist_id,
       round(v_distributable_pool * v_main_pct / 100, 2), v_main_pct);
  END IF;

  IF v_song_id IS NOT NULL THEN
    FOR collab IN
      SELECT sc.artist_id, sc.split_pct, a.user_id
      FROM public.song_collaborators sc
      JOIN public.artists a ON a.id = sc.artist_id
      WHERE sc.song_id = v_song_id
        AND sc.accepted = true
        AND sc.role <> 'main'
    LOOP
      INSERT INTO public.revenue_splits
        (transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
      VALUES
        (NEW.id, collab.user_id, 'collaborator', collab.artist_id,
         round(v_distributable_pool * collab.split_pct / 100, 2), collab.split_pct);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Backstop for the double-charge bug: one album receipt per buyer, enforced by
-- the database rather than only by the app guard. fulfillAlbum writes the
-- receipt with song_id NULL, so a second completed (user_id, album_id) row of
-- that shape is a bug, not a legitimate second purchase.
--
-- The double-charge bug means duplicates may already exist, and CREATE UNIQUE
-- INDEX would abort the whole migration on them. Keep the earliest receipt per
-- buyer/album and drop the rest. These rows grant no revenue of their own (the
-- album branch no longer allocates), so deleting them moves no money — but the
-- artist's payouts for the duplicated sales stay, because those live in
-- revenue_splits against the transactions, not against these rows.
DELETE FROM public.purchases p
WHERE p.album_id IS NOT NULL
  AND p.status = 'completed'
  AND p.song_id IS NULL
  AND p.id NOT IN (
    SELECT MIN(d.id)
      FROM public.purchases d
     WHERE d.album_id IS NOT NULL
       AND d.status = 'completed'
       AND d.song_id IS NULL
     GROUP BY d.user_id, d.album_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS purchases_completed_album_uniq
  ON public.purchases (user_id, album_id)
  WHERE album_id IS NOT NULL AND status = 'completed' AND song_id IS NULL;

-- Give every sellable album a real price.
--
-- albums.price is nullable and the catalogue importer wrote NULL when a spec
-- omitted one. The shelf summed the tracks and displayed that figure, but the
-- album page, the checkout and the charge all read the raw column — so those
-- albums showed a price on the grid, had no Buy button at all, and a direct
-- API call was rejected with "Unable to determine price". "Never priced" and
-- "deliberately free" both meant NULL, so nothing could tell them apart.
--
-- Backfill from the tracks where they are actually paid. Albums whose tracks
-- are all free stay 0 and are correctly shown as free.
UPDATE public.albums a
SET price = t.total
FROM (
  SELECT album_id, SUM(price)::numeric(10,2) AS total
    FROM public.songs
   WHERE album_id IS NOT NULL
     AND status = 'approved'
     AND price > 0
   GROUP BY album_id
) t
WHERE t.album_id = a.id
  AND (a.price IS NULL OR a.price = 0)
  AND t.total > 0;

-- From here on "no price" must be an explicit 0 (deliberately free) rather than
-- NULL, so the app can stop reading an unpriced release as free.
UPDATE public.albums SET price = 0 WHERE price IS NULL;
ALTER TABLE public.albums ALTER COLUMN price SET DEFAULT 0;
ALTER TABLE public.albums ALTER COLUMN price SET NOT NULL;