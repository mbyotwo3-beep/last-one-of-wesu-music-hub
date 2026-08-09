-- ============================================================
-- CAROUSEL TABLES FOR HOMEPAGE BUILDER
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create home_carousels table (the row/shelf itself)
CREATE TABLE IF NOT EXISTS public.home_carousels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  subtitle      text,
  show_all_link text,            -- optional "See All" URL e.g. /new-music
  position      integer NOT NULL DEFAULT 0,  -- order on homepage (0 = top)
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Create home_carousel_items table (individual cards inside a carousel)
CREATE TABLE IF NOT EXISTS public.home_carousel_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id  uuid NOT NULL REFERENCES public.home_carousels(id) ON DELETE CASCADE,
  title        text NOT NULL,
  subtitle     text,
  image_url    text NOT NULL,    -- direct URL or storage path
  link_url     text NOT NULL,    -- where clicking takes the user e.g. /albums/uuid or /artists/uuid
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes for fast queries
CREATE INDEX IF NOT EXISTS home_carousels_position_idx ON public.home_carousels(position);
CREATE INDEX IF NOT EXISTS home_carousel_items_carousel_idx ON public.home_carousel_items(carousel_id, position);

-- 4. RLS policies — public can READ active carousels, only staff can write
ALTER TABLE public.home_carousels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_carousel_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read active carousels
CREATE POLICY "Public read active carousels"
  ON public.home_carousels FOR SELECT
  USING (active = true);

-- Anyone can read items of active carousels
CREATE POLICY "Public read carousel items"
  ON public.home_carousel_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.home_carousels c
      WHERE c.id = carousel_id AND c.active = true
    )
  );

-- Staff (admin/superadmin) can read ALL (including inactive)
CREATE POLICY "Staff read all carousels"
  ON public.home_carousels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Staff read all carousel items"
  ON public.home_carousel_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

-- Staff can INSERT carousels
CREATE POLICY "Staff insert carousels"
  ON public.home_carousels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Staff insert carousel items"
  ON public.home_carousel_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

-- Staff can UPDATE carousels
CREATE POLICY "Staff update carousels"
  ON public.home_carousels FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Staff update carousel items"
  ON public.home_carousel_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

-- Staff can DELETE carousels (cascade deletes items automatically)
CREATE POLICY "Staff delete carousels"
  ON public.home_carousels FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Staff delete carousel items"
  ON public.home_carousel_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'superadmin')
    )
  );

-- 5. Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('home_carousels', 'home_carousel_items');
