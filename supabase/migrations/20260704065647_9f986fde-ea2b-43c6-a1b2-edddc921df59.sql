
-- Auto-grant 'artist' role when an artist application is approved.
CREATE OR REPLACE FUNCTION public.grant_artist_role_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'artist'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grant_artist_role ON public.artists;
CREATE TRIGGER trg_grant_artist_role
  AFTER INSERT OR UPDATE OF status ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.grant_artist_role_on_approval();

-- Backfill: any already-approved artists that lack the 'artist' role.
INSERT INTO public.user_roles (user_id, role)
SELECT a.user_id, 'artist'::app_role
FROM public.artists a
WHERE a.status = 'approved'
  AND a.user_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
