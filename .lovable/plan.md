## Goal

Get Wesu+ launch-ready on both the Lovable preview and the separate wesuplusly.com deployment: real Lenco mobile-money payments, all three role dashboards fully working, every menu route functional.

## Work breakdown

### 1. Lenco mobile-money USSD fix (highest priority)
Symptom: initiation succeeds but the phone never rings.
- Read `src/lib/lenco.server.ts` + `checkout.tsx` to inspect the exact request payload sent to Lenco.
- Compare against Lenco's collection API: correct endpoint (`/collections:mobile-money` vs `/collections:card`), correct `bearer`/operator code per network (MTN `mtn-zm`, Airtel `airtel-zm`, Zamtel `zamtel-zm`), MSISDN formatted as `260XXXXXXXXX` (no `+`, no leading `0`), amount as an integer in ngwee.
- Fix payload shape, add a server-side log of Lenco's response body on failure, surface the real error in checkout.
- Confirm reference/webhook secret wiring end-to-end.

### 2. Role dashboards — full pass

**Listener `/dashboard`**
- Verify Library, Liked Songs, Saved Albums, Orders/Receipts, Recently Played, Playback-history clear, Subscription (hidden per earlier decision), account settings link.
- Wire any stubs to real server fns; fix empty-state and loading states.

**Artist `/artist-studio` + `/artist-dashboard`**
- Upload wizard (audio + cover + metadata + collaborators/splits), draft/pending/approved status badges.
- Analytics: plays, saves, listeners over time.
- Payouts: balance, request payout form, payout history, method selection.
- Profile editor sanity check.

**Label `/label-dashboard`**
- Roster (invite + accepted artists), royalty split view, label balance & payout requests, label profile edit.

### 3. Menu route audit
Walk every top-nav item and fix broken/empty:
`/`, `/browse`, `/search`, `/radio`, `/library`, `/playlists`, `/albums`, `/artists`, `/labels`, `/new-music`, `/hot-tracks`, `/must-have`, `/recently-added`, `/collabs`, `/notifications`, `/contact`, `/apply-label`, `/become-artist`, `/checkout`, `/checkout/success`.
For each: loads without error, data comes from backend, empty state is graceful, actions work, mobile parity via `MobileShell`.

### 4. wesuplusly.com deployment
Since it's a separate deploy, ensure:
- Env vars documented (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, LENCO_API_URL, LENCO_PUBLIC_KEY, LENCO_SECRET_KEY, LENCO_WEBHOOK_SECRET, VITE_SUPABASE_*).
- Lenco webhook URL: `https://www.wesuplusly.com/api/public/lenco-webhook` registered in Lenco dashboard.
- Same Supabase project keys used on both deploys (already the case).
- CORS / origin — none needed since API is same-origin server routes.

### 5. Verification
- Playwright script that: signs in, opens each menu route, screenshots, asserts no error boundary.
- Manual Lenco test (user runs on their phone) after fix.
- Security scan + linter clean.

## Out of scope
- New features not already in the codebase (e.g. new social login, new AI features).
- Re-enabling subscription UI (still hidden per earlier decision).
- Native mobile packaging changes.
- Design/theme overhaul.

## Delivery order
1. Lenco USSD fix (unblocks revenue).
2. Menu route audit (catches biggest visible breakage fast).
3. Role dashboard completion pass.
4. Deployment checklist doc for wesuplusly.com.
5. Verification pass.

## Risks
- Some Lenco failures are account-side (KYC, unapproved test MSISDN, sandbox vs live keys). If the payload is already correct, the fix is on the Lenco dashboard side and I'll document what to check.
- "Everything in the menu list" is broad; if a route needs a redesign rather than a fix, I'll flag it and defer instead of silently reshaping it.
