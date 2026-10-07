-- Allow 'suspended' status in artists table check constraint
-- In Wesu+, artists.status is a TEXT column with a CHECK constraint (not an ENUM type)

DO $$
BEGIN
  -- Drop existing check constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'artists_status_check' 
    AND conrelid = 'public.artists'::regclass
  ) THEN
    ALTER TABLE public.artists DROP CONSTRAINT artists_status_check;
  END IF;

  -- Add updated check constraint including 'suspended'
  ALTER TABLE public.artists 
  ADD CONSTRAINT artists_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));
EXCEPTION
  WHEN others THEN
    ALTER TABLE public.artists 
    ADD CONSTRAINT artists_status_check 
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));
END $$;

-- Update notification trigger to notify when an artist is suspended
CREATE OR REPLACE FUNCTION public.notify_artist_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected', 'suspended') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id, 
      'artist_moderation',
      CASE 
        WHEN NEW.status = 'approved' THEN 'Your artist application was approved'
        WHEN NEW.status = 'suspended' THEN 'Your artist account has been suspended'
        ELSE 'Your artist application was rejected'
      END,
      NEW.name,
      CASE 
        WHEN NEW.status = 'suspended' THEN '/become-artist'
        ELSE '/artist-dashboard'
      END
    );
  END IF;
  RETURN NEW;
END $$;
