-- Create hero_carousel_slides table for managing homepage hero section
CREATE TABLE IF NOT EXISTS public.hero_carousel_slides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  image_url text NOT NULL,
  video_url text,
  cta_text text NOT NULL,
  cta_link text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hero_carousel_slides_pkey PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.hero_carousel_slides ENABLE ROW LEVEL SECURITY;

-- Create storage bucket for hero images if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('hero-images', 'hero-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies

-- Public can read active slides
CREATE POLICY "Public can read active hero slides"
ON public.hero_carousel_slides FOR SELECT
USING (active = true);

-- Staff (admin/superadmin) can read all slides
CREATE POLICY "Staff can read all hero slides"
ON public.hero_carousel_slides FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- Staff can insert slides
CREATE POLICY "Staff can insert hero slides"
ON public.hero_carousel_slides FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- Staff can update slides
CREATE POLICY "Staff can update hero slides"
ON public.hero_carousel_slides FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- Staff can delete slides
CREATE POLICY "Staff can delete hero slides"
ON public.hero_carousel_slides FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- Storage policies for hero-images bucket

-- Public can read hero images
CREATE POLICY "Public can read hero images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'hero-images');

-- Staff can upload hero images
CREATE POLICY "Staff can upload hero images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'hero-images'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- Staff can delete hero images
CREATE POLICY "Staff can delete hero images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'hero-images'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS hero_carousel_slides_active_position_idx 
ON public.hero_carousel_slides(active, position);

-- Add comment
COMMENT ON TABLE public.hero_carousel_slides IS 'Hero carousel slides for the homepage hero section with auto-rotating slides';
