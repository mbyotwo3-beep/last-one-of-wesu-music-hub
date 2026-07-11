# Wesu+ completeness pass

Scope is large. I'll ship it in 5 phases, each independently useful and testable. I'll go straight through — no per-phase check-ins unless something needs a decision.

## Phase 1 — 404 audit + broken links
Walk every `<Link to=...>` and `navigate({ to })` in the app, cross-check against `src/routes/`, and either:
- create the missing route with a real page, or
- redirect the link to the correct existing route.

Known gaps:
- `/playlists/$id` — playlist detail page (list songs, play all, remove).
- `/new-music`, `/must-have`, `/hot-tracks` — shelf "See all" pages on `/browse` currently 404.
- `/notifications` — bell in navbar.
- `/artist-studio/*` sub-tabs referenced by MobileArtistStudio.
- Any other dead link I find during the sweep.

## Phase 2 — Artist profile pic + Spotify-style player
- Fix `avatar_url` render: `StorageImage` currently only handles `artist-images`/`album-art`. Add `user-avatars` bucket support and use signed URLs everywhere the profile pic renders (Navbar, ProfileEdit, MobileProfile, artist card).
- Desktop `PlayerBar`: tighten to Spotify look — album art thumb clickable to expand, hoverable progress bar with scrubbing thumb, current/total time flanking bar, volume slider with mute icon, queue button. Keep the 3-column layout but reduce visual weight.
- Mobile `MiniPlayer` + `NowPlayingScreen`: wire skipNext/skipPrev to the player store's new queue actions, add shuffle/repeat toggles in NowPlaying, ensure taps expand the sheet.

## Phase 3 — Real search
Replace the "coming soon" placeholder on `/search`:
- Debounced input, tabs (All / Songs / Artists / Albums / Playlists).
- Backed by existing `searchSongs` server fn + new `searchArtists`, `searchAlbums`, `searchPlaylists`.
- Result rows link to the right detail page; songs are playable inline.

## Phase 4 — Superadmin homepage CMS
Full drag-and-drop builder at `/superadmin/homepage`:
- Persist layouts to `platform_settings.homepage_layout` (JSON): `{ page: 'home'|'listen-now'|'browse', shelves: [{ id, type, title, query, order, visible }], hero_slides: [...] }`.
- Shelf types: `new_music`, `hot_tracks`, `featured_artists`, `must_have_albums`, `by_genre`, `by_artist`, `by_playlist`, `custom`.
- Drag-reorder with `@dnd-kit` (already installable), toggle visibility, edit title, pick data source.
- Hero slider editor: add/remove/reorder slides, upload cover, pick linked item.
- Home/Listen Now/Browse routes read the layout via a public `getHomepageLayout` server fn and render accordingly. Falls back to defaults if empty.

## Phase 5 — Payments end-to-end
Lenco (mobile money, ZMW) is already integrated as the primary gateway (envs `LENCO_*` set, webhook at `/api/public/lenco-webhook`). I'll complete the flow rather than swap providers:
- Checkout page: full order summary, method picker (MTN/Airtel money via Lenco), phone entry, initiates payment, polls status.
- Success page: shows purchase receipt, "Play now" CTA, adds to library.
- Free-song K100 upload fee: wire `UploadWizard` to actually initiate a Lenco payment before submitting the song; song stays `pending` until webhook marks fee `paid`.
- Purchases visible in Library → Purchased tab; unlocks unlimited playback for that song.
- Artist earnings: dashboard already reads `revenue_splits`; verify the trigger fires and add a Payouts request UI.
- Subscription plans: `/subscriptions` page lists plans, "Subscribe" button starts Lenco recurring, webhook updates `subscriptions` row, `getSignedAudioUrl` respects active subscription (skip paywall).

## Technical notes

- `attachSupabaseAuth` in `src/start.ts` stays as-is; all new protected fns use `requireSupabaseAuth`.
- New DB objects (approvals needed as we hit them): `playlist_songs` policies for owner reads on private, `homepage_layout` key in `platform_settings` (data insert, not schema), `notifications` read endpoint (table exists).
- No new tables expected for phases 1–3. Phase 4 uses `platform_settings`. Phase 5 uses existing `purchases`, `subscriptions`, `payment_transactions`, `payouts`.
- Superadmin bypass already in `getSignedAudioUrl`; subscription check will be added alongside.

## Out of scope (call out and skip)
- Native mobile app packaging changes (Capacitor rebuild).
- Switching payment provider away from Lenco.
- Redesign of navbar/sidebar chrome.

I'll start on Phase 1 as soon as you approve.