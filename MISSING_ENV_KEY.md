# ⚠️ Missing Environment Variable

## Error
```
Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY
```

## What This Means
The admin diagnostics feature requires the Supabase Service Role Key to access admin-level database operations. This key is missing from your `.env` file.

## 🔐 How to Get the Service Role Key

### Step 1: Go to Supabase Dashboard
1. Visit https://supabase.com/dashboard
2. Select your project: **rxutbtgrpshmaymlpgfq**

### Step 2: Find the Service Role Key
1. Click on **Settings** (gear icon in left sidebar)
2. Click on **API** 
3. Scroll down to **Project API keys**
4. Find the **`service_role` key** (marked as "secret")
5. Click the eye icon to reveal it
6. Copy the key (starts with `eyJ...`)

### Step 3: Add to .env File
Add this line to your `.env` file:

```env
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
```

**Complete .env should look like:**
```env
SUPABASE_PROJECT_ID="rxutbtgrpshmaymlpgfq"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_lPs-9deRIqsT8BiI8-fKlw_bEaw-_oK"
SUPABASE_URL="https://rxutbtgrpshmaymlpgfq.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
VITE_SUPABASE_PROJECT_ID="rxutbtgrpshmaymlpgfq"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_lPs-9deRIqsT8BiI8-fKlw_bEaw-_oK"
VITE_SUPABASE_URL="https://rxutbtgrpshmaymlpgfq.supabase.co"
```

### Step 4: Restart Dev Server
After adding the key:
```bash
# Stop the server (Ctrl+C)
# Then restart:
npm run dev
```

---

## ⚠️ Security Warning

**NEVER commit the service role key to git!**

The `.env` file should already be in `.gitignore`, but double-check:
```bash
# Check if .env is ignored
git check-ignore .env
```

If it returns `.env`, you're good. If not, add it to `.gitignore`:
```
.env
.env.local
.env.*.local
```

---

## Alternative: Use Admin Panel Without Diagnostics

While you don't have the service role key, you can still approve artists using the regular admin panel:

1. Go to `/admin`
2. Click **"artists"** tab (skip diagnostics tab for now)
3. Click "Approve" for each pending artist

The regular admin functions work with your current authenticated user permissions and don't require the service role key.

---

## Why Service Role Key is Needed

The **diagnostics tab** needs to:
- Read all artists regardless of status
- Check user_roles table for data integrity
- Generate comprehensive reports

These operations require elevated permissions that only the service role key provides.

**Regular admin operations** (approving artists, moderating content) work with your authenticated session and don't need this key.

---

## What Features Require Service Role Key?

### ✅ Works WITHOUT Service Role Key:
- Regular login/signup
- Browsing artists, songs, albums
- Becoming an artist (application)
- Artist dashboard
- Artist studio (uploading songs)
- **Approving artists via admin panel**
- **Moderating content via admin panel**
- Most admin operations

### ❌ Requires Service Role Key:
- **Admin diagnostics tab** (new feature we added)
- Checking data integrity across tables
- Certain superadmin operations
- Database backfills and migrations

---

## Quick Solution

**For now, just use the admin panel without the diagnostics tab:**

1. Go to `/admin`
2. Click "artists" tab
3. Approve pending artists manually

**Later, when you add the service role key:**
- The diagnostics tab will work
- You'll get comprehensive artist status reports
- Data integrity checks will be available

---

## Summary

- ⚠️ **Error cause:** Missing `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- 🔐 **Solution:** Get key from Supabase Dashboard → Settings → API
- ✅ **Workaround:** Use admin panel's artists tab to approve (works without key)
- 🔒 **Security:** Never commit service role key to git

**The diagnostic feature is nice-to-have, but artist approval still works without it!**
