# Wesu+ — Road to Public Launch

A staged sweep across every role and surface, ending with a production publish. One stage per turn so you can test between them.

## Stage 0 — Green build (done in this turn)
Fixed the two remaining TypeScript errors in the label payout balance helper so the build is clean before anything else lands.

## Stage 1 — Payments, end to end
- Re-run a real mobile money charge (MTN/Airtel/Zamtel) and a card charge through the Lenco widget.
- Confirm the 3s verification poller settles the transaction, the receipt renders, and entitlements unlock without a refresh.
- Confirm the webhook path settles the same transaction idempotently (no double fulfilment, no double revenue split).
- Check `payment_transactions`, `orders`, `revenue_splits` rows all line up for a single purchase.
- Failure/cancel paths: user-visible error toast, transaction marked failed, retry possible.

## Stage 2 — Storage cutover verification
- Verify every media surface reads through R2 signed URLs: cover art, artist images, avatars, full audio, previews, downloads.
- Verify uploads (song audio, album art, artist image, avatar) go direct to R2 and play back.
- Confirm legacy Supabase objects lazily copy across on first read.
- Confirm paid audio is never reachable without entitlement.

## Stage 3 — Listener flows
Auth → browse → play (preview + full) → like/save track and album → purchase → receipt → library → play history → clear history.
Fix dead buttons, missing empty/loading states, non-persisting saves, orphaned links, and any shelf that fails to refresh after a like/save.

## Stage 4 — Artist flows
Apply → approval notification → dashboard → upload song/album → collaborators and split % validation → analytics → payout request → payout status.
Fix upload validation, split totals, available-balance math, and missing error surfaces.

## Stage 5 — Label flows
Label application → invite artists → accept invite → roster management → royalty % edit → payout request → status.
Fix invitation acceptance, roster permission errors surfacing, and payout math visibility.

## Stage 6 — Admin + Superadmin
Moderation queues (songs, artists, labels) approve/reject with notifications → payouts approve/reject/mark paid → featured slots and homepage carousels CRUD → user role grant/revoke → platform settings → audit log.
Fix queues that don't refresh, missing destructive-action confirmations, and permission errors.

## Stage 7 — Launch hardening
- Security scan; resolve criticals; confirm RLS on every table with user data.
- Per-route head metadata (title, description, OG/Twitter) on all content routes.
- 404/error boundaries on routes with loaders; sitemap and robots.
- Mobile layout pass on the main flows.
- Remove leftover dev artefacts (root-level `.sql`/`.md` scratch files, `build-output.txt`, `status.txt`).

## Stage 8 — Publish
Publish to production so the payment fixes, R2 storage layer and new secrets go live, then smoke-test the live URL: home, browse, play a free track, one real purchase.

## Out of scope
- Subscriptions (stays hidden per your earlier decision).
- Redesigns or new features beyond fixing what exists.
- The separate official-site repo.

Each stage ends with a short report: what I tested, what was broken, what I changed.
