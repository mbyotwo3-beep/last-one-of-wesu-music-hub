# Artist Visibility Issue - Diagnosis & Fix

## Problem Summary
You're only seeing 2 artists on the artists page even though you've approved other users to become artists.

## Root Cause
When users apply to become artists via the "Become an Artist" page, their artist profile is created with `status = 'pending'`. The artists listing page (`/artists`) only shows artists with `status = 'approved'`. 

The admin approval process should update the status to `'approved'`, but this may not have happened for all approved artists.

## How the System Works

1. **Artist Application** (`/become-artist`)
   - User fills out form
   - Creates artist record with `status = 'pending'`
   - Located in: `src/lib/artist.functions.ts` → `applyAsArtist()`

2. **Admin Approval** (`/admin`)
   - Admin reviews pending artists
   - Clicks "Approve" button
   - Updates `status = 'approved'` AND `verified = true`
   - Also grants the user the `'artist'` role in `user_roles` table
   - Located in: `src/lib/admin.functions.ts` → `moderateArtist()`

3. **Artists Page** (`/artists`)
   - Queries artists with `status = 'approved'`
   - Located in: `src/lib/music.functions.ts` → `listArtists()`

## Diagnosis Steps

### Step 1: Check Current Artist Status
Run this SQL query in your Supabase SQL Editor:

```sql
SELECT 
  status,
  COUNT(*) as count
FROM public.artists
GROUP BY status;
```

Expected output:
- If you see pending artists: They haven't been approved yet
- If you see approved artists: They should be visible on /artists page

### Step 2: List All Artists
```sql
SELECT 
  id,
  name,
  status,
  verified,
  created_at,
  user_id
FROM public.artists
ORDER BY created_at DESC;
```

This shows all artists and their current status.

### Step 3: Check Admin Panel
1. Go to `/admin` in your app
2. Click on the "artists" tab
3. You should see any pending artist applications
4. Click "Approve" for each artist you want to make visible

## Quick Fix Solutions

### Solution 1: Approve via Admin Panel (RECOMMENDED)
1. Login as an admin user
2. Navigate to `/admin`
3. Click the "artists" tab
4. Click "Approve" button next to each pending artist

This is the correct workflow and ensures:
- Status is set to 'approved'
- Verified flag is set to true
- Artist role is granted to the user
- Audit log entry is created

### Solution 2: Bulk Approve via SQL (Use with caution)
If you want to approve ALL pending artists at once, run this SQL:

```sql
-- Step 1: Update artists status
UPDATE public.artists 
SET status = 'approved', verified = true 
WHERE status = 'pending';

-- Step 2: Grant artist role to all approved artists
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT a.user_id, 'artist'::app_role
FROM public.artists a
WHERE a.status = 'approved'
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = a.user_id AND ur.role = 'artist'
)
ON CONFLICT (user_id, role) DO NOTHING;
```

### Solution 3: Approve Specific Artists
If you know which artists should be approved, run this for each:

```sql
-- Replace 'artist-id-here' with the actual artist ID
UPDATE public.artists 
SET status = 'approved', verified = true 
WHERE id = 'artist-id-here';

-- Grant role (replace 'user-id-here' with the user_id from the artist)
INSERT INTO public.user_roles (user_id, role)
VALUES ('user-id-here', 'artist'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;
```

## Verify the Fix

After applying any fix, verify:

1. **Check Database:**
   ```sql
   SELECT status, COUNT(*) 
   FROM public.artists 
   GROUP BY status;
   ```
   You should see more artists with status = 'approved'

2. **Check Artists Page:**
   - Navigate to `/artists` in your app
   - You should now see all approved artists

3. **Check Artist Dashboard:**
   - Login as one of the newly approved artists
   - Navigate to `/artist-dashboard`
   - They should see their dashboard, not a "pending approval" message

## Prevention

The system is working as designed. The workflow is:
1. Users apply → status = 'pending'
2. Admins review and approve → status = 'approved'
3. Only approved artists show on `/artists` page

This prevents spam and ensures quality control. If you want to auto-approve artists, you would need to modify the `applyAsArtist()` function to set `status = 'approved'` instead of `'pending'`, but this is NOT recommended for production.

## Files Involved

- `src/lib/artist.functions.ts` - Artist application logic
- `src/lib/admin.functions.ts` - Admin moderation logic
- `src/lib/music.functions.ts` - Artist listing (listArtists function)
- `src/routes/artists.index.tsx` - Artists page UI
- `src/routes/admin.tsx` - Admin panel UI
- `src/routes/become-artist.tsx` - Artist application form

## Migration

A new migration has been created at:
`supabase/migrations/20260625000000_fix_artist_status.sql`

This migration:
- Adds proper constraints on the status column
- Adds an index for better performance
- Documents the status field behavior

Apply it by running:
```bash
npx supabase db push
```

Or in Supabase Dashboard → SQL Editor → run the migration file contents.
