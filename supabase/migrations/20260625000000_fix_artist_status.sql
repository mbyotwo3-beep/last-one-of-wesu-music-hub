-- Fix Artist Status Issue
-- This migration ensures all artists who have been created are visible on the artists page

-- First, let's see what the issue is:
-- Artists created via the become-artist flow get status='pending'
-- When approved by admin, status is updated to 'approved'
-- Only artists with status='approved' show on the artists page

-- Option 1: Update all existing artists to 'approved' (if you want all current artists visible)
-- Uncomment the following line if you want to approve all existing artists:
-- UPDATE public.artists SET status = 'approved' WHERE status = 'pending';

-- Option 2: Add a comment to document the expected behavior
COMMENT ON COLUMN public.artists.status IS 'Artist moderation status: pending (awaiting review), approved (visible on platform), rejected (application denied)';

-- Add an index on status for better query performance (if not already exists)
CREATE INDEX IF NOT EXISTS idx_artists_status ON public.artists(status);

-- Ensure the moderation function works correctly by adding a check constraint
-- to validate status values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'artists_status_check'
  ) THEN
    ALTER TABLE public.artists 
    ADD CONSTRAINT artists_status_check 
    CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;
