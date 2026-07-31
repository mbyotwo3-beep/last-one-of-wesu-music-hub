-- ==========================================================
-- WESU+ MUSIC HUB - ARTIST VERIFICATION & SCHEMA UPDATE
-- Execute this SQL in your Supabase SQL Editor
-- ==========================================================

-- 1. Add verification_status column to artists table
ALTER TABLE public.artists 
ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'none';

-- 2. Update existing verified artists so their verification_status is 'verified'
UPDATE public.artists 
SET verification_status = 'verified' 
WHERE verified = true;

-- 3. Update non-verified artists default status
UPDATE public.artists 
SET verification_status = 'none' 
WHERE verified = false AND (verification_status IS NULL OR verification_status = '');

-- 4. Verify table changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'artists' AND column_name = 'verification_status';
