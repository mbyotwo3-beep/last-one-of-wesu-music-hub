DROP POLICY IF EXISTS "Active carousels are viewable by everyone" ON public.home_carousels;
DROP POLICY IF EXISTS "Staff manage carousels" ON public.home_carousels;
DROP POLICY IF EXISTS "Carousel items follow their carousel" ON public.home_carousel_items;
DROP POLICY IF EXISTS "Staff manage carousel items" ON public.home_carousel_items;

DROP FUNCTION IF EXISTS public.is_staff(uuid);

CREATE POLICY "Active carousels are viewable by everyone"
  ON public.home_carousels FOR SELECT
  USING (active = true OR private.is_staff(auth.uid()));

CREATE POLICY "Staff manage carousels"
  ON public.home_carousels FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "Carousel items follow their carousel"
  ON public.home_carousel_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.home_carousels c
      WHERE c.id = home_carousel_items.carousel_id
        AND (c.active = true OR private.is_staff(auth.uid()))
    )
  );

CREATE POLICY "Staff manage carousel items"
  ON public.home_carousel_items FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));