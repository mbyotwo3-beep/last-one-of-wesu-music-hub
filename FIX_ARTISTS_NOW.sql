-- ============================================
-- Quick Fix: Approve All Pending Artists
-- ============================================
-- Run this SQL in your Supabase SQL Editor to approve all pending artists at once.

-- Step 1: Approve all pending artists
UPDATE public.artists 
SET status = 'approved', verified = true 
WHERE status = 'pending';

-- Step 2: Grant the 'artist' role to all approved artists who don't have it yet
-- NOTE: The role type is 'app_role', not 'user_role'
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT a.user_id, 'artist'::app_role
FROM public.artists a
WHERE a.status = 'approved'
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = a.user_id AND ur.role = 'artist'
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Verify the results
SELECT 
  'Artists by Status' as report,
  status,
  COUNT(*) as count
FROM public.artists
GROUP BY status
ORDER BY status;
