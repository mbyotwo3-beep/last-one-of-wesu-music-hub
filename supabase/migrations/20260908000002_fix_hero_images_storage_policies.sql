-- Fix hero-images storage policies to use user_id folder structure
-- This matches the uploadFileToBucket function which uses user_id as folder prefix

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Staff can upload hero images" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete hero images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read hero images" ON storage.objects;

-- Create new policies using user_id folder structure
CREATE POLICY "Public can read hero images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'hero-images');

CREATE POLICY "Staff can upload hero images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'hero-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Staff can update hero images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'hero-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  bucket_id = 'hero-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Staff can delete hero images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'hero-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- Add service_role policy for full access
CREATE POLICY "Service role can manage hero images"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'hero-images')
WITH CHECK (bucket_id = 'hero-images');
