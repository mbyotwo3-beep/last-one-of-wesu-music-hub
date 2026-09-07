-- Create storage bucket for label images
INSERT INTO storage.buckets (id, name, public)
VALUES ('label-images', 'label-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for label-images bucket

-- Public can read label images
CREATE POLICY "Public can read label images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'label-images');

-- Label owners can upload label images
CREATE POLICY "Label owners can upload label images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'label-images'
  AND EXISTS (
    SELECT 1 FROM public.labels
    WHERE owner_user_id = auth.uid()
    AND id::text = (storage.foldername(name))[1]
  )
);

-- Label owners can update label images
CREATE POLICY "Label owners can update label images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'label-images'
  AND EXISTS (
    SELECT 1 FROM public.labels
    WHERE owner_user_id = auth.uid()
    AND id::text = (storage.foldername(name))[1]
  )
);

-- Label owners can delete label images
CREATE POLICY "Label owners can delete label images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'label-images'
  AND EXISTS (
    SELECT 1 FROM public.labels
    WHERE owner_user_id = auth.uid()
    AND id::text = (storage.foldername(name))[1]
  )
);
