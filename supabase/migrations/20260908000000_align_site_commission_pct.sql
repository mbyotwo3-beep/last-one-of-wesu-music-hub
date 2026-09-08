-- Launch: platform commission lives on platform_settings.key='site'.commission_pct.
-- Align seed leftover 15% to 20% and make the split trigger fall back to 20,
-- still honoring a live Superadmin Settings value.

UPDATE public.platform_settings
SET
  value = COALESCE(value, '{}'::jsonb) || jsonb_build_object('commission_pct', 20),
  updated_at = now()
WHERE key = 'site'
  AND (
    value ->> 'commission_pct' IS NULL
    OR NULLIF(value ->> 'commission_pct', '') IS NULL
    OR (value ->> 'commission_pct')::numeric = 15
  );

INSERT INTO public.platform_settings (key, value)
VALUES (
  'site',
  '{"name":"Wesu+","support_email":"support@wesu.app","commission_pct":20}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

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
