# Security Fixes - July 8, 2026

## Overview
This document details the security vulnerabilities identified during a deep agentic security scan and the comprehensive fixes implemented to address them.

## Critical Issues Fixed

### 1. ✅ Unbounded Revenue Split Percentages
**Issue**: `inviteCollaborator` and `inviteArtistToLabel` accepted `split_pct`/`royalty_pct` with no server-side validation, unlike `setArtistRoyalty` which validated 0-100 range. Malicious users could insert negative or >100 values, corrupting revenue calculations.

**Fix Applied**:
- **Database Level**: Added CHECK constraints on `song_collaborators.split_pct` and `label_artists.royalty_pct` to enforce 0-100 range
- **Application Level**: Added validation in both functions:
  ```typescript
  if (!Number.isFinite(data.split_pct) || data.split_pct < 0 || data.split_pct > 100) {
    throw new Error("split_pct must be between 0 and 100");
  }
  ```

**Files Modified**:
- `src/lib/collabs.functions.ts` - Added validation to `inviteCollaborator()`
- `src/lib/labels.functions.ts` - Added validation to `inviteArtistToLabel()`
- `supabase/migrations/20260708000000_security_fixes.sql` - Added DB constraints

---

### 2. ✅ Unverified Payout Amounts
**Issue**: `requestPayout` and `requestLabelPayout` inserted user-supplied amounts directly into payouts with no verification against actual earned revenue. A malicious account could request inflated payouts exceeding their balance.

**Fix Applied**:
- **Database Level**: 
  - Added CHECK constraint for positive amounts
  - Added CHECK constraint for reasonable maximum ($1M)
  - Created functions: `get_artist_available_balance()` and `get_label_available_balance()`
  - Created audit trigger to log excessive payout requests

- **Application Level**:
  - Created helper functions: `getArtistAvailableBalance()` and `getLabelAvailableBalance()`
  - Added balance verification before inserting payout
  - Added amount validation (positive, <= $1M)
  - Enhanced audit logging with balance information

**Example Validation**:
```typescript
const available = await getArtistAvailableBalance(supabase, artistId);
if (data.amount > available) {
  throw new Error(
    `Insufficient balance. Available: $${available.toFixed(2)}, Requested: $${data.amount.toFixed(2)}`
  );
}
```

**Files Modified**:
- `src/lib/artist.functions.ts` - Added balance check to `requestPayout()`
- `src/lib/labels.functions.ts` - Added balance check to `requestLabelPayout()`
- `supabase/migrations/20260708000000_security_fixes.sql` - Added DB functions and constraints

---

### 3. ✅ Revenue Split Exposure
**Issue**: The `collabs public read accepted` policy allowed unauthenticated users to read ALL columns of accepted `song_collaborators` rows, including `split_pct`, exposing internal revenue-sharing terms.

**Fix Applied**:
- **Database Level**:
  - Dropped overly permissive public policy
  - Created `public_song_collaborators` view exposing only non-financial columns
  - Created restricted RLS policies for authenticated users to access their own data only
  - Granted SELECT on view to anon/authenticated roles

**View Created**:
```sql
CREATE OR REPLACE VIEW public_song_collaborators AS
SELECT 
  id, song_id, artist_id, role, accepted, created_at
FROM song_collaborators
WHERE accepted = true;
```

**Files Modified**:
- `supabase/migrations/20260708000000_security_fixes.sql` - Created view and policies

---

### 4. ✅ Function Search Path Mutable
**Issue**: Database functions didn't have `search_path` explicitly set, making them vulnerable to search path manipulation attacks.

**Fix Applied**:
- **Database Level**: All security definer functions now have `SET search_path = public`
- Examples:
  - `get_artist_available_balance()` - SET search_path = public
  - `get_label_available_balance()` - SET search_path = public
  - `audit_payout_request()` - SET search_path = public

**Files Modified**:
- `supabase/migrations/20260708000000_security_fixes.sql` - Fixed all functions

---

### 5. ℹ️ Label Profiles Public Read (No Issue Found)
**Issue**: Scan flagged that approved label profiles use a policy applying to 'public' role.

**Analysis**: This is intentional and correct. Approved labels should be viewable by logged-out visitors (anon role). No changes needed.

---

## Testing Recommendations

### 1. Test Split Percentage Validation
```bash
# Should reject negative percentage
curl -X POST /api/inviteCollaborator \
  -d '{"song_id":"xxx", "artist_id":"yyy", "role":"featured", "split_pct":-10}'

# Should reject >100 percentage
curl -X POST /api/inviteCollaborator \
  -d '{"song_id":"xxx", "artist_id":"yyy", "role":"featured", "split_pct":150}'

# Should accept valid percentage
curl -X POST /api/inviteCollaborator \
  -d '{"song_id":"xxx", "artist_id":"yyy", "role":"featured", "split_pct":50}'
```

### 2. Test Payout Amount Validation
```bash
# Should reject when exceeding balance
# Assuming artist has $100 available
curl -X POST /api/requestPayout \
  -d '{"amount":500, "method_code":"bank", "destination":"xxx"}'

# Should accept when within balance
curl -X POST /api/requestPayout \
  -d '{"amount":50, "method_code":"bank", "destination":"xxx"}'
```

### 3. Test Revenue Split Privacy
```bash
# As unauthenticated user, should NOT see split_pct
curl -X GET /api/listSongCollaborators?song_id=xxx

# Should only return: id, song_id, artist_id, role, accepted, created_at
```

### 4. Database Constraint Tests
```sql
-- Test split_pct constraint (should fail)
INSERT INTO song_collaborators (split_pct, ...) VALUES (-10, ...);
INSERT INTO song_collaborators (split_pct, ...) VALUES (150, ...);

-- Test royalty_pct constraint (should fail)
INSERT INTO label_artists (royalty_pct, ...) VALUES (-5, ...);
INSERT INTO label_artists (royalty_pct, ...) VALUES (105, ...);

-- Test payout amount constraints (should fail)
INSERT INTO payouts (amount, ...) VALUES (-100, ...);
INSERT INTO payouts (amount, ...) VALUES (2000000, ...);
```

---

## Migration Application

To apply these fixes:

1. **Run Database Migration**:
   ```bash
   # The migration is automatically applied via Supabase
   # File: supabase/migrations/20260708000000_security_fixes.sql
   ```

2. **Deploy Application Code**:
   ```bash
   npm run build
   git add .
   git commit -m "fix: critical security vulnerabilities - revenue splits, payouts, data exposure"
   git push origin main
   ```

3. **Verify Deployment**:
   - Check Supabase Dashboard → Database → Migrations for successful migration
   - Test the validation scenarios above
   - Monitor audit_log for any excessive payout attempts

---

## Security Best Practices Implemented

1. **Defense in Depth**: Validation at both application AND database levels
2. **Least Privilege**: Public users only see non-sensitive data via restricted views
3. **Audit Logging**: All sensitive operations logged, especially suspicious activity
4. **Input Validation**: All numeric inputs validated for type, range, and reasonableness
5. **Balance Verification**: Payouts verified against calculated available balance
6. **Function Security**: All SECURITY DEFINER functions have immutable search_path

---

## Monitoring & Alerts

Monitor the `audit_log` table for:
- `payout.request.excessive` - Attempts to request more than available balance
- Frequent failed validations from the same user
- Unusual patterns in split_pct or royalty_pct values

```sql
-- Query to find suspicious payout attempts
SELECT 
  actor_id,
  COUNT(*) as attempt_count,
  SUM((meta->>'excess')::numeric) as total_excess
FROM audit_log
WHERE action = 'payout.request.excessive'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY actor_id
HAVING COUNT(*) > 3
ORDER BY total_excess DESC;
```

---

## Related Files

### Application Code
- `src/lib/collabs.functions.ts` - Collaboration split validation
- `src/lib/labels.functions.ts` - Label royalty & payout validation
- `src/lib/artist.functions.ts` - Artist payout validation

### Database
- `supabase/migrations/20260708000000_security_fixes.sql` - Comprehensive security migration

### Documentation
- `SECURITY_FIXES.md` (this file) - Detailed security fix documentation

---

## Sign-off

**Date**: July 8, 2026  
**Issues Fixed**: 4 critical, 1 informational  
**Testing Status**: Requires validation post-deployment  
**Deployment Status**: Code committed, awaiting push to production
