-- Unpayable collaborator royalties belong to the platform.
--
-- THE BUG
--
-- song_collaborators rows come in two shapes. An account credit has artist_id
-- set and is an invitation the person must accept. A name-only credit — a
-- producer or writer recorded by name, who is explicitly NOT required to have
-- an account — has artist_id NULL and credit_name set, and is live immediately.
--
-- The split trigger treated those two shapes differently:
--
--   deduction: SELECT SUM(split_pct) FROM song_collaborators
--              WHERE song_id = ... AND accepted AND role <> 'main'
--              -- counted EVERYTHING, name-only credits included
--
--   payout:    FROM song_collaborators sc
--              JOIN artists a ON a.id = sc.artist_id
--              -- an INNER JOIN, so artist_id IS NULL was silently dropped
--
-- A name-only credit of 20% therefore REDUCED the main artist's share by 20
-- points and then paid that 20% to nobody. It vanished from the platform on
-- every sale of that track — and name-only credits are the normal case for the
-- producers and writers the product is built around.
--
-- THE RULE
--
-- Platform commission is 20%. The remaining 80% is the artists' pool. A credit
-- with no account has nobody to pay, so that share does not belong to the main
-- artist and does not disappear — it goes to the platform owners.
--
-- So:
--
--   * the DEDUCTION only counts credits that can actually be paid, so no share
--     is taken from the main artist for a payment nobody receives;
--   * the unpayable share is recorded as an additional 'platform' split row,
--     labelled with the percentage it represents.
--
-- Two platform rows per transaction (commission, and unpayable royalties) is
-- safe: revenue_splits has no uniqueness constraint on
-- (transaction_id, payee_role), and the app has no aggregate platform-revenue
-- query yet to be confused by it. Each row's pct is self-describing — 20 for
-- commission, the unclaimed percentage for the second.
--
-- The rest of the function is copied verbatim from 20261008120000.

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
  v_unclaimed_amount numeric := 0;
  v_post_platform_pool numeric;
  v_label_id uuid;
  v_label_owner uuid;
  v_artist_royalty_pct numeric;
  v_label_amount numeric := 0;
  v_distributable_pool numeric;
  v_total_collab_pct numeric := 0;
  v_unclaimed_pct numeric := 0;
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
    -- Split the credited shares by whether they can be paid at all. 'main' is
    -- the credited performer, who is the main artist, so excluded from both.
    SELECT
      COALESCE(SUM(sc.split_pct) FILTER (WHERE sc.artist_id IS NOT NULL), 0),
      COALESCE(SUM(sc.split_pct) FILTER (WHERE sc.artist_id IS NULL), 0)
      INTO v_total_collab_pct, v_unclaimed_pct
      FROM public.song_collaborators sc
      WHERE sc.song_id = v_song_id
        AND sc.accepted = true
        AND sc.role <> 'main';

    -- Only payable shares come out of the main artist's percentage. This filter
    -- is what was missing, and its absence is what lost the money.
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
    -- Must select exactly the rows the deduction counted, or the two drift apart
    -- and money goes missing again.
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

  -- Royalties for a credited person with no account. Nobody exists to pay, and
  -- they must not be docked from the main artist, so they belong to the
  -- platform. Recorded as its own row so the amount and reason stay auditable
  -- rather than being quietly folded into commission.
  IF v_unclaimed_pct > 0 THEN
    v_unclaimed_amount := round(v_distributable_pool * v_unclaimed_pct / 100, 2);
    INSERT INTO public.revenue_splits (transaction_id, payee_role, amount, pct)
    VALUES (NEW.id, 'platform', v_unclaimed_amount, v_unclaimed_pct);
  END IF;

  RETURN NEW;
END;
$$;

-- Reconciliation: how much the platform holds because a credited collaborator
-- has no account, and who they are.
--
-- The absorbed royalty is identified as the platform split whose pct is NOT the
-- commission. The commission is read from platform_settings using the same
-- COALESCE the trigger uses, rather than hardcoded — an earlier draft filtered
-- `rs.pct > 20`, which would silently under-report the moment the commission
-- was configured to anything else.
CREATE OR REPLACE FUNCTION public.absorbed_royalties_summary()
RETURNS TABLE (
  song_id uuid,
  song_title text,
  credited_names text,
  unclaimed_pct_total numeric,
  absorbed_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH commission AS (
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
    ) AS pct
  ),
  absorbed_per_song AS (
    SELECT pt.item_id AS song_id, SUM(rs.amount) AS amount
      FROM public.revenue_splits rs
      JOIN public.payment_transactions pt ON pt.id = rs.transaction_id
      CROSS JOIN commission c
     WHERE rs.payee_role = 'platform'
       AND pt.status = 'completed'
       AND pt.item_type = 'song'
       AND rs.pct <> c.pct
     GROUP BY pt.item_id
  ),
  unclaimed_per_song AS (
    SELECT sc.song_id,
           SUM(sc.split_pct) AS pct_total,
           string_agg(DISTINCT sc.credit_name, ', ') AS names
      FROM public.song_collaborators sc
     WHERE sc.artist_id IS NULL
       AND sc.accepted = true
       AND sc.role <> 'main'
       AND sc.credit_name IS NOT NULL
     GROUP BY sc.song_id
  )
  SELECT u.song_id, s.title, u.names, u.pct_total, a.amount
    FROM unclaimed_per_song u
    JOIN public.songs s ON s.id = u.song_id
    JOIN absorbed_per_song a ON a.song_id = u.song_id
   ORDER BY 5 DESC;
$$;

REVOKE ALL ON FUNCTION public.absorbed_royalties_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.absorbed_royalties_summary() TO service_role;