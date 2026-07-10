# Quick Fix Guide: Artist Visibility Issue

## Problem
Only seeing 2 artists on the `/artists` page even though you've approved other users.

## Quick Solution (5 minutes)

### Option 1: Use the New Diagnostics Tab (EASIEST)
1. Login as an admin
2. Go to `/admin`
3. Click the new **"diagnostics"** tab
4. Review the artist status report
5. If you see pending artists, click "Go to Artists Tab"
6. Click "Approve" for each pending artist

### Option 2: Direct Admin Approval
1. Login as an admin
2. Go to `/admin`
3. Click the **"artists"** tab
4. Click "Approve" button next to each artist you want to make visible
5. Wait a moment, then check `/artists` page

### Option 3: Bulk SQL Fix (For many pending artists)
If you have many pending artists, run this SQL in Supabase SQL Editor:

```sql
-- Approve all pending artists
UPDATE public.artists 
SET status = 'approved', verified = true 
WHERE status = 'pending';

-- Grant artist role to all approved artists
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

## What Changed

### New Features Added:
1. **Diagnostics Tab** in Admin Panel
   - Shows total artists, approved, pending, rejected counts
   - Lists pending artists awaiting approval
   - Detects data integrity issues
   - Provides actionable recommendations

2. **Artist Status Utilities** (`src/lib/artist-status-utils.ts`)
   - Helper functions to diagnose artist status issues
   - Can be used for debugging and monitoring

3. **New Migration** (`supabase/migrations/20260625000000_fix_artist_status.sql`)
   - Adds proper constraints on artist status field
   - Adds performance index
   - Documents the status field behavior

### Files Modified:
- `src/lib/admin.functions.ts` - Added `getArtistDiagnostics()` function
- `src/routes/admin.tsx` - Added diagnostics tab and UI
- Created `src/lib/artist-status-utils.ts` - Diagnostic utilities
- Created `ARTIST_VISIBILITY_FIX.md` - Comprehensive documentation
- Created `ARTIST_STATUS_DIAGNOSTIC.sql` - SQL diagnostic queries

## Verification

After applying the fix:

1. **Check Admin Diagnostics:**
   - Go to `/admin` → diagnostics tab
   - Should show 0 pending artists
   - Should show increased "Visible on /artists" count

2. **Check Artists Page:**
   - Go to `/artists`
   - Should see all approved artists displayed

3. **Check Individual Artist:**
   - Login as an approved artist
   - Go to `/artist-dashboard`
   - Should see the dashboard (not "pending approval" message)

## How It Works

**Artist Approval Workflow:**
```
User applies → status = 'pending' → Admin approves → status = 'approved' → Shows on /artists
```

**What happens when admin clicks "Approve":**
1. Artist status updated to 'approved'
2. Verified flag set to true
3. 'artist' role granted to user in user_roles table
4. Audit log entry created
5. Artist becomes visible on `/artists` page

## Prevention

The system is working as designed. This is an **approval-based workflow** to ensure quality:
- Users must apply to become artists
- Admins review and approve applications
- Only approved artists are publicly visible

If you want to auto-approve all artists (NOT recommended), you would need to modify `src/lib/artist.functions.ts` line 61 to set `status: "approved"` instead of `"pending"`.

## Need More Help?

See the detailed documentation in:
- `ARTIST_VISIBILITY_FIX.md` - Comprehensive troubleshooting guide
- `ARTIST_STATUS_DIAGNOSTIC.sql` - SQL queries for debugging
- Admin Panel → Diagnostics Tab - Real-time status monitoring
