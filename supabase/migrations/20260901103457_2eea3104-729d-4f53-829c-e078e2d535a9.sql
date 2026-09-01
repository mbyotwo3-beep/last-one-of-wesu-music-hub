-- 1. Artist verification status
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'none';

-- 2. Staff check helper used by the admin/superadmin server functions
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::app_role, 'superadmin'::app_role)
  )
$$;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- 3. Homepage carousels
CREATE TABLE IF NOT EXISTS public.home_carousels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  show_all_link text,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_carousel_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id uuid NOT NULL REFERENCES public.home_carousels(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  image_url text NOT NULL,
  link_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_carousel_items_carousel_idx
  ON public.home_carousel_items (carousel_id, position);

GRANT SELECT ON public.home_carousels TO anon;
GRANT SELECT ON public.home_carousel_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_carousels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_carousel_items TO authenticated;
GRANT ALL ON public.home_carousels TO service_role;
GRANT ALL ON public.home_carousel_items TO service_role;

ALTER TABLE public.home_carousels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_carousel_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active carousels are viewable by everyone"
  ON public.home_carousels FOR SELECT
  USING (active = true OR public.is_staff(auth.uid()));

CREATE POLICY "Staff manage carousels"
  ON public.home_carousels FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Carousel items follow their carousel"
  ON public.home_carousel_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.home_carousels c
      WHERE c.id = home_carousel_items.carousel_id
        AND (c.active = true OR public.is_staff(auth.uid()))
    )
  );

CREATE POLICY "Staff manage carousel items"
  ON public.home_carousel_items FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_home_carousels_updated
  BEFORE UPDATE ON public.home_carousels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();