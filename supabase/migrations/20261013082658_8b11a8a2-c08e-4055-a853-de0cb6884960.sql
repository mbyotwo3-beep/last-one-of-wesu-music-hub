CREATE OR REPLACE FUNCTION public.artists_guard_privileged()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR private.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.status := 'pending';
    IF NEW.verification_status IS DISTINCT FROM 'pending' THEN NEW.verification_status := COALESCE(NULLIF(NEW.verification_status,'verified'),'none'); END IF;
    RETURN NEW;
  END IF;
  IF NEW.verified IS DISTINCT FROM OLD.verified THEN RAISE EXCEPTION 'Only staff can change verification'; END IF;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status <> 'pending' THEN
    RAISE EXCEPTION 'Only staff can decide verification'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (NEW.status = 'pending' AND OLD.status IN ('rejected','suspended')) THEN
    RAISE EXCEPTION 'Only staff can change artist approval status'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_artists_guard_privileged ON public.artists;
CREATE TRIGGER trg_artists_guard_privileged BEFORE INSERT OR UPDATE ON public.artists
FOR EACH ROW EXECUTE FUNCTION public.artists_guard_privileged();

CREATE OR REPLACE FUNCTION public.labels_guard_privileged()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR private.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.status := 'pending'; RETURN NEW; END IF;
  IF NEW.commission_pct IS DISTINCT FROM OLD.commission_pct THEN RAISE EXCEPTION 'Only staff can change commission'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (NEW.status = 'pending' AND OLD.status = 'rejected') THEN
    RAISE EXCEPTION 'Only staff can change label approval status'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_labels_guard_privileged ON public.labels;
CREATE TRIGGER trg_labels_guard_privileged BEFORE INSERT OR UPDATE ON public.labels
FOR EACH ROW EXECUTE FUNCTION public.labels_guard_privileged();

REVOKE EXECUTE ON FUNCTION public.artists_guard_privileged() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.labels_guard_privileged() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.increment_follower_count(uuid) SET search_path = public;
ALTER FUNCTION public.decrement_follower_count(uuid) SET search_path = public;