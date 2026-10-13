CREATE OR REPLACE FUNCTION public.albums_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR private.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('approved','rejected') THEN
      RAISE EXCEPTION 'Only staff can approve or reject albums';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Only staff can approve or reject albums';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.albums_guard_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS albums_guard_status ON public.albums;
CREATE TRIGGER albums_guard_status BEFORE INSERT OR UPDATE ON public.albums
FOR EACH ROW EXECUTE FUNCTION public.albums_guard_status();