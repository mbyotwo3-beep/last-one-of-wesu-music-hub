CREATE OR REPLACE FUNCTION public.songs_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_verified boolean;
BEGIN
  IF auth.uid() IS NULL OR private.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT a.verified INTO v_verified FROM public.artists a
      WHERE a.id = NEW.artist_id AND a.status = 'approved';
    IF NOT COALESCE(v_verified, false) THEN
      IF TG_OP = 'INSERT' THEN NEW.status := 'pending';
      ELSE RAISE EXCEPTION 'Only staff can approve songs'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.songs_guard_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_songs_guard_status ON public.songs;
CREATE TRIGGER trg_songs_guard_status BEFORE INSERT OR UPDATE ON public.songs
FOR EACH ROW EXECUTE FUNCTION public.songs_guard_status();