
-- 1) Grant superadmin to mbyotwo2@gmail.com
INSERT INTO public.user_roles (user_id, role)
SELECT 'da8dab26-be50-47f7-b175-0e690ad59349'::uuid, 'superadmin'::app_role
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='da8dab26-be50-47f7-b175-0e690ad59349' AND role='superadmin');

-- Also grant 'admin' so admin-scoped policies (e.g. has_role 'admin') apply
INSERT INTO public.user_roles (user_id, role)
SELECT 'da8dab26-be50-47f7-b175-0e690ad59349'::uuid, 'admin'::app_role
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='da8dab26-be50-47f7-b175-0e690ad59349' AND role='admin');

-- 2) Auto-approve any artist record this user already created
UPDATE public.artists SET status='approved'
 WHERE user_id='da8dab26-be50-47f7-b175-0e690ad59349' AND status='pending';

-- 3) Storage RLS policies for the four buckets.
-- Path layout used by the app: <user_id>/<timestamp>-<filename>
-- Policy: an authenticated user can manage objects in their own first-folder.
-- Staff (admin/superadmin) can manage anything. Reads are allowed to authenticated users.

DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['song-audio','album-art','artist-images','user-avatars'] LOOP
    EXECUTE format($p$DROP POLICY IF EXISTS "%1$s_owner_rw" ON storage.objects$p$, b);
    EXECUTE format($p$DROP POLICY IF EXISTS "%1$s_auth_read" ON storage.objects$p$, b);
    EXECUTE format($p$DROP POLICY IF EXISTS "%1$s_staff_all" ON storage.objects$p$, b);

    EXECUTE format($p$
      CREATE POLICY "%1$s_owner_rw" ON storage.objects
        FOR ALL TO authenticated
        USING (bucket_id = %1$L AND (storage.foldername(name))[1] = auth.uid()::text)
        WITH CHECK (bucket_id = %1$L AND (storage.foldername(name))[1] = auth.uid()::text)
    $p$, b);

    EXECUTE format($p$
      CREATE POLICY "%1$s_auth_read" ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = %1$L)
    $p$, b);

    EXECUTE format($p$
      CREATE POLICY "%1$s_staff_all" ON storage.objects
        FOR ALL TO authenticated
        USING (bucket_id = %1$L AND public.is_staff(auth.uid()))
        WITH CHECK (bucket_id = %1$L AND public.is_staff(auth.uid()))
    $p$, b);
  END LOOP;
END $$;
