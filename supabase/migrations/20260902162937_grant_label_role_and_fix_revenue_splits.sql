-- Label approval must give the owner a first-class label role. The trigger
-- covers every approval path (admin dashboard, direct staff update, import)
-- and the INSERT backfill makes the result correct for existing labels.
CREATE OR REPLACE FUNCTION public.grant_label_role_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved')
     AND NEW.owner_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.owner_user_id, 'label'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_label_role_on_approval()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_label_role_on_approval() TO service_role;

DROP TRIGGER IF EXISTS trg_grant_label_role ON public.labels;
CREATE TRIGGER trg_grant_label_role
AFTER INSERT OR UPDATE OF status ON public.labels
FOR EACH ROW EXECUTE FUNCTION public.grant_label_role_on_approval();

INSERT INTO public.user_roles (user_id, role)
SELECT l.owner_user_id, 'label'::public.app_role
FROM public.labels l
WHERE l.status = 'approved'
ON CONFLICT (user_id, role) DO NOTHING;

-- A payout belongs to exactly one payee. Label payouts were impossible while
-- artist_id was NOT NULL, even though label_id already exists in the schema.
ALTER TABLE public.payouts
  ALTER COLUMN artist_id DROP NOT NULL;

ALTER TABLE public.payouts
  DROP CONSTRAINT IF EXISTS payouts_exactly_one_payee;
ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_exactly_one_payee
  CHECK (num_nonnulls(artist_id, label_id) = 1) NOT VALID;

CREATE INDEX IF NOT EXISTS revenue_splits_artist_balance_idx
  ON public.revenue_splits (artist_id, payee_role)
  WHERE artist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS revenue_splits_label_balance_idx
  ON public.revenue_splits (label_id, payee_role)
  WHERE label_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payouts_artist_reserve_idx
  ON public.payouts (artist_id, status)
  WHERE artist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payouts_label_reserve_idx
  ON public.payouts (label_id, status)
  WHERE label_id IS NOT NULL;

-- The payment transaction id is the durable idempotency key for an unlock.
-- Earlier purchases did not persist it, so the partial index leaves those
-- historical NULL values untouched while preventing future duplicate grants.
CREATE UNIQUE INDEX IF NOT EXISTS purchases_transaction_ref_unique_idx
  ON public.purchases (transaction_ref)
  WHERE transaction_ref IS NOT NULL;

DROP POLICY IF EXISTS "Label owner sees payouts" ON public.payouts;
CREATE POLICY "Label owner sees payouts" ON public.payouts
  FOR SELECT TO authenticated
  USING (label_id IS NOT NULL AND private.is_label_owner(auth.uid(), label_id));

DROP POLICY IF EXISTS "Label owner creates payouts" ON public.payouts;
CREATE POLICY "Label owner creates payouts" ON public.payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    label_id IS NOT NULL
    AND artist_id IS NULL
    AND private.is_label_owner(auth.uid(), label_id)
  );

-- Keep the database ledger authoritative. It is triggered only after the
-- application has created the buyer entitlement and marked its transaction
-- completed. Label terms use the active label_artists royalty_pct: that is the
-- artist's percentage of the post-platform pool; the label receives the
-- remainder. The label's commission_pct is used as the default when inviting
-- a new artist, not as a second fee.
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
  v_platform_pct numeric := 15;
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

  IF NEW.item_type = 'song' THEN
    SELECT s.id, s.artist_id
      INTO v_song_id, v_artist_id
      FROM public.songs s
      WHERE s.id = NEW.item_id;
  ELSIF NEW.item_type = 'album' THEN
    SELECT a.artist_id
      INTO v_artist_id
      FROM public.albums a
      WHERE a.id = NEW.item_id;
  ELSE
    RAISE EXCEPTION 'Unsupported payment transaction item type: %', NEW.item_type;
  END IF;

  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Cannot allocate revenue for missing item %', NEW.item_id;
  END IF;

  SELECT COALESCE(NULLIF(value ->> 'commission_pct', '')::numeric, 15)
    INTO v_platform_pct
    FROM public.platform_settings
    WHERE key = 'site';
  v_platform_pct := LEAST(GREATEST(COALESCE(v_platform_pct, 15), 0), 100);

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

REVOKE ALL ON FUNCTION public.compute_revenue_splits()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_revenue_splits() TO service_role;

DROP TRIGGER IF EXISTS trg_compute_revenue_splits ON public.payment_transactions;
CREATE TRIGGER trg_compute_revenue_splits
AFTER INSERT OR UPDATE OF status ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.compute_revenue_splits();

-- Pending and approved payout requests reserve the balance. Collaborator
-- shares are paid to their artists through the same balance function.
CREATE OR REPLACE FUNCTION public.get_artist_available_balance(artist_uuid uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    COALESCE((
      SELECT SUM(rs.amount)
      FROM public.revenue_splits rs
      WHERE rs.artist_id = artist_uuid
        AND rs.payee_role IN ('artist', 'collaborator')
    ), 0)
    - COALESCE((
      SELECT SUM(p.amount)
      FROM public.payouts p
      WHERE p.artist_id = artist_uuid
        AND p.status IN ('pending', 'approved', 'processing', 'paid', 'completed')
    ), 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_label_available_balance(label_uuid uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    COALESCE((
      SELECT SUM(rs.amount)
      FROM public.revenue_splits rs
      WHERE rs.label_id = label_uuid
        AND rs.payee_role = 'label'
    ), 0)
    - COALESCE((
      SELECT SUM(p.amount)
      FROM public.payouts p
      WHERE p.label_id = label_uuid
        AND p.status IN ('pending', 'approved', 'processing', 'paid', 'completed')
    ), 0)
  );
$$;

REVOKE ALL ON FUNCTION public.get_artist_available_balance(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_label_available_balance(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_available_balance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_label_available_balance(uuid) TO service_role;
