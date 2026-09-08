-- Add cta_external field to hero_carousel_slides table
-- This allows admins to explicitly mark CTA links as external (opens in new tab)
-- vs internal links (open in same tab)

ALTER TABLE public.hero_carousel_slides
ADD COLUMN IF NOT EXISTS cta_external boolean NOT NULL DEFAULT false;

-- Add comment explaining the field
COMMENT ON COLUMN public.hero_carousel_slides.cta_external IS 'If true, CTA link opens in new tab. If false, opens in same tab for internal routes.';
