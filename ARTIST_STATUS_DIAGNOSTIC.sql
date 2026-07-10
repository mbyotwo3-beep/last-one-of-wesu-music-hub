-- Artist Status Diagnostic Query
-- Run this in your Supabase SQL Editor to see the current state of all artists

-- 1. Count artists by status
SELECT 
  status,
  COUNT(*) as count
FROM public.artists
GROUP BY status
ORDER BY status;

-- 2. List all artists with their status
SELECT 
  id,
  name,
  user_id,
  status,
  verified,
  created_at
FROM public.artists
ORDER BY created_at DESC;

-- 3. Find artists that are pending approval
SELECT 
  a.id,
  a.name,
  a.status,
  a.created_at,
  p.full_name as user_full_name,
  au.email as user_email
FROM public.artists a
LEFT JOIN public.profiles p ON a.user_id = p.user_id
LEFT JOIN auth.users au ON a.user_id = au.id
WHERE a.status = 'pending'
ORDER BY a.created_at DESC;

-- 4. Check if artists have the 'artist' role in user_roles table
SELECT 
  a.id,
  a.name,
  a.status,
  ur.role as user_role
FROM public.artists a
LEFT JOIN public.user_roles ur ON a.user_id = ur.user_id AND ur.role = 'artist'
ORDER BY a.created_at DESC;

-- 5. SQL to approve all pending artists (ONLY RUN IF YOU WANT TO APPROVE ALL)
-- UNCOMMENT AND RUN ONLY IF NEEDED:
-- UPDATE public.artists 
-- SET status = 'approved', verified = true 
-- WHERE status = 'pending';

-- 6. SQL to ensure approved artists have the artist role
-- UNCOMMENT AND RUN ONLY IF NEEDED:
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT DISTINCT a.user_id, 'artist'::app_role
-- FROM public.artists a
-- WHERE a.status = 'approved'
-- AND NOT EXISTS (
--   SELECT 1 FROM public.user_roles ur 
--   WHERE ur.user_id = a.user_id AND ur.role = 'artist'
-- )
-- ON CONFLICT (user_id, role) DO NOTHING;
