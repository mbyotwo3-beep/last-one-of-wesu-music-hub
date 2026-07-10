
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

DROP POLICY IF EXISTS "Albums are public" ON public.albums;
CREATE POLICY "Albums approved public" ON public.albums
  FOR SELECT TO anon, authenticated
  USING (status = 'approved'
         OR EXISTS (SELECT 1 FROM public.artists a WHERE a.id = albums.artist_id AND a.user_id = auth.uid())
         OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by all users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by all" ON public.profiles;
CREATE POLICY "Profiles self or artist read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.artists a WHERE a.user_id = profiles.user_id AND a.status = 'approved')
    OR public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "Users can create own purchases" ON public.purchases;
REVOKE INSERT, UPDATE, DELETE ON public.purchases FROM authenticated;

DROP POLICY IF EXISTS "Users insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users update own subscription" ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;

REVOKE UPDATE, DELETE ON public.payment_transactions FROM authenticated;

CREATE OR REPLACE FUNCTION public.label_artists_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_label_owner(auth.uid(), NEW.label_id) OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.royalty_pct IS DISTINCT FROM OLD.royalty_pct
     OR NEW.label_id IS DISTINCT FROM OLD.label_id
     OR NEW.artist_id IS DISTINCT FROM OLD.artist_id THEN
    RAISE EXCEPTION 'Only the label owner can change royalty_pct/label_id/artist_id';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_label_artists_guard ON public.label_artists;
CREATE TRIGGER trg_label_artists_guard
  BEFORE UPDATE ON public.label_artists
  FOR EACH ROW EXECUTE FUNCTION public.label_artists_guard();
