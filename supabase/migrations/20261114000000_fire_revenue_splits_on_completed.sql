-- Revenue splits never fired for real purchases.
--
-- The terminal status the payment flow writes is 'completed'
-- (src/lib/payments.server.ts maps provider success → status 'completed' and
-- never to 'paid'). The trigger guarded on NEW.status = 'paid' only, so
-- compute_revenue_splits() returned early for every real sale: no platform
-- share, no artist payout rows. audit-money.mjs caught 13 completed
-- transactions (K199.50) with no revenue_splits at all, several from the
-- current week.
--
-- Fix: fire on transition INTO 'paid' OR 'completed'; skip recomputes when the
-- row is already in a terminal state (idempotent re-saves stay no-ops).
-- The rest of the split math (commission, label royalty, collaborators,
-- album fan-out) is unchanged.
CREATE OR REPLACE FUNCTION public.compute_revenue_splits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_song_id uuid;
  v_album_id uuid;
  v_artist_id uuid;
  v_artist_user uuid;
  v_label_id uuid;
  v_track_label uuid;
  v_track_count integer;
  v_commission numeric;
  v_label_pct numeric;
  v_label_owner uuid;
  v_royalty numeric;
  v_platform_amount numeric;
  v_label_amount numeric;
  v_artist_pool numeric;
  v_track_pool numeric;
  v_split_total numeric;
  v_collab_total numeric;
  v_amt numeric;
  v_owner_amount numeric;
  v_owner_pct numeric;
  collab record;
  track record;
BEGIN
  -- The payment flow's terminal status is 'completed' (payments.server.ts);
  -- 'paid' is kept for compatibility. Fire once on transition INTO either,
  -- and never recompute a row already in a terminal state.
  IF NEW.status NOT IN ('paid', 'completed')
     OR (TG_OP = 'UPDATE' AND OLD.status IN ('paid', 'completed')) THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.revenue_splits WHERE transaction_id = NEW.id;

  -- platform commission
  SELECT COALESCE((value)::numeric, 15) INTO v_commission
    FROM public.platform_settings WHERE key='commission_pct' LIMIT 1;
  IF v_commission IS NULL THEN v_commission := 15; END IF;

  -- resolve song/artist/label
  IF NEW.item_type = 'song' THEN
    SELECT id, artist_id, label_id INTO v_song_id, v_artist_id, v_label_id
      FROM public.songs WHERE id=NEW.item_id;
  ELSIF NEW.item_type = 'album' THEN
    SELECT id, artist_id INTO v_album_id, v_artist_id
      FROM public.albums WHERE id=NEW.item_id;
    SELECT label_id INTO v_label_id FROM public.artists WHERE id=v_artist_id;
    -- A label release request attaches one label to every track. When the
    -- whole album carries the same label, that release-level label wins over
    -- the artist's general label.
    SELECT CASE WHEN count(DISTINCT label_id) = 1 THEN min(label_id) END
      INTO v_track_label
      FROM public.songs
      WHERE album_id = NEW.item_id AND status = 'approved' AND label_id IS NOT NULL;
    IF v_track_label IS NOT NULL THEN v_label_id := v_track_label; END IF;
  ELSE
    -- subscription / unknown → all to platform
    INSERT INTO public.revenue_splits(transaction_id, payee_role, amount, pct)
      VALUES (NEW.id, 'platform', NEW.amount, 100);
    RETURN NEW;
  END IF;

  v_platform_amount := round(NEW.amount * v_commission / 100, 2);
  INSERT INTO public.revenue_splits(transaction_id, payee_role, amount, pct)
    VALUES (NEW.id, 'platform', v_platform_amount, v_commission);

  v_artist_pool := NEW.amount - v_platform_amount;

  -- label cut: the roster's negotiated royalty is the ARTIST's share, so the
  -- label keeps 100 - royalty. Fall back to the label's default commission
  -- when there is no active roster entry.
  IF v_label_id IS NOT NULL THEN
    SELECT commission_pct, owner_user_id INTO v_label_pct, v_label_owner
      FROM public.labels WHERE id=v_label_id;
    SELECT royalty_pct INTO v_royalty
      FROM public.label_artists
      WHERE label_id = v_label_id AND artist_id = v_artist_id AND status = 'active'
      ORDER BY joined_at DESC NULLS LAST
      LIMIT 1;
    IF v_royalty IS NOT NULL THEN
      v_label_pct := 100 - v_royalty;
    END IF;
    v_label_pct := GREATEST(0, LEAST(100, COALESCE(v_label_pct, 15)));
    IF v_label_pct > 0 THEN
      v_label_amount := round(v_artist_pool * v_label_pct / 100, 2);
      INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, label_id, amount, pct)
        VALUES (NEW.id, v_label_owner, 'label', v_label_id, v_label_amount, v_label_pct);
      v_artist_pool := v_artist_pool - v_label_amount;
    END IF;
  END IF;

  SELECT user_id INTO v_artist_user FROM public.artists WHERE id=v_artist_id;

  IF NEW.item_type = 'song' THEN
    v_split_total := 0;
    v_collab_total := 0;
    FOR collab IN
      SELECT sc.artist_id, sc.split_pct, a.user_id
      FROM public.song_collaborators sc
      JOIN public.artists a ON a.id = sc.artist_id
      WHERE sc.song_id = v_song_id AND sc.accepted = true AND sc.split_pct > 0
    LOOP
      v_amt := round(v_artist_pool * collab.split_pct / 100, 2);
      IF v_amt > 0 THEN
        INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
          VALUES (NEW.id, collab.user_id, 'collaborator', collab.artist_id, v_amt, collab.split_pct);
        v_collab_total := v_collab_total + v_amt;
        v_split_total := v_split_total + collab.split_pct;
      END IF;
    END LOOP;

    v_owner_amount := v_artist_pool - v_collab_total;
    v_owner_pct := GREATEST(0, 100 - v_split_total);
    IF v_owner_amount > 0 AND v_artist_user IS NOT NULL THEN
      INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
        VALUES (NEW.id, v_artist_user, 'artist', v_artist_id, v_owner_amount, v_owner_pct);
    END IF;
    RETURN NEW;
  END IF;

  -- Album: divide the artist pool equally across approved tracks, apply each
  -- track's accepted splits, then pay the credited artist the remainder once.
  SELECT count(*) INTO v_track_count
    FROM public.songs WHERE album_id = v_album_id AND status = 'approved';
  IF v_track_count = 0 THEN
    IF v_artist_pool > 0 AND v_artist_user IS NOT NULL THEN
      INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
        VALUES (NEW.id, v_artist_user, 'artist', v_artist_id, v_artist_pool, 100);
    END IF;
    RETURN NEW;
  END IF;

  v_track_pool := v_artist_pool / v_track_count;
  v_collab_total := 0;
  FOR track IN
    SELECT id FROM public.songs WHERE album_id = v_album_id AND status = 'approved'
  LOOP
    FOR collab IN
      SELECT sc.artist_id, sc.split_pct, a.user_id
      FROM public.song_collaborators sc
      JOIN public.artists a ON a.id = sc.artist_id
      WHERE sc.song_id = track.id AND sc.accepted = true AND sc.split_pct > 0
    LOOP
      v_amt := round(v_track_pool * collab.split_pct / 100, 2);
      IF v_amt > 0 THEN
        INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
          VALUES (NEW.id, collab.user_id, 'collaborator', collab.artist_id, v_amt, collab.split_pct);
        v_collab_total := v_collab_total + v_amt;
      END IF;
    END LOOP;
  END LOOP;

  v_owner_amount := v_artist_pool - v_collab_total;
  IF v_owner_amount > 0 AND v_artist_user IS NOT NULL THEN
    INSERT INTO public.revenue_splits(transaction_id, payee_user_id, payee_role, artist_id, amount, pct)
      VALUES (NEW.id, v_artist_user, 'artist', v_artist_id, v_owner_amount, 100);
  END IF;

  RETURN NEW;
END $function$;
