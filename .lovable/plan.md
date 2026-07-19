# Launch Gap-Fill Sweep

Goal: make every role's existing surfaces work end-to-end. No new features — only fill gaps in what's already wired.

## Method

For each role, I'll:
1. Audit the routes/components that already exist for that role.
2. Run the flows against the live app (Playwright + DB reads).
3. Fix any broken/missing pieces (dead buttons, failing server fns, missing empty states, missing RLS, missing toasts on failure).
4. Record findings + fixes in the chat before moving on.

I will NOT redesign anything, add new features, or restructure dashboards.

## Order of work (one turn each)

### 1. Lenco payment verification (blocker)
- Read `payment_transactions` after a real attempt.
- If USSD still doesn't fire: inspect Lenco initiation request/response, verify operator code + phone format sent, confirm webhook secret round-trips.
- Fix whatever the logs show. Report clearly what was wrong.

### 2. Listener flows
- Auth → browse → play (preview + full) → like/save track & album → purchase (single/album) → receipt → library (liked, saved albums, orders) → play history → clear history.
- Fix: any broken navigation, missing loading/empty states, save button not persisting, orphaned links.

### 3. Artist flows
- Artist application → approval notification → dashboard → upload song → add collaborators → view analytics → request payout → see payout status.
- Fix: upload validation, split % validation surface, payout available-balance display, missing error toasts.

### 4. Label flows
- Label creation → invite artists → accept invite → roster management → royalty % edit → label payout request → payout status.
- Fix: invitation acceptance path, roster guard errors surfaced, payout math visible.

### 5. Admin + Superadmin flows
- Moderation queues (songs/artists/labels) approve+reject with notifications firing → payouts approve/reject/mark paid → featured slots CRUD → user role grant/revoke → platform settings edit → audit log visible.
- Fix: any queue action that doesn't refresh, missing confirmations on destructive actions, RPC permission errors.

## Out of scope

- Subscriptions (hidden per prior decision).
- New features, redesigns, mobile-vs-desktop parity beyond what already exists.
- Official-site deploy config (separate repo).

## Deliverable per turn

A short report: what I tested, what was broken, what I changed, what to try next. You test payment on your phone between turns when I ask.

---

Reply "go" to start with **step 1 (Lenco verification)**, or name a different step to start there.
