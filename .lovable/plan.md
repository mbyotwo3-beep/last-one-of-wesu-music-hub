# Fix bugs + upload/player upgrades

The root cause behind most of the visible bugs is one thing: `cover_url` and `audio_url` are stored as raw storage paths (e.g. `db1b76c3.../1783700288359-images.jpg`) but rendered directly as `<img src>` or fed to `<audio>`. Buckets are private, so the browser gets "Invalid URI" / broken images. Everything below flows from fixing that.

## 1. Storage URL resolution (fixes cover art + broken mobile playback)

- Make image buckets publicly readable so `<img>` tags work everywhere without server round-trips:
  - `album-art`, `artist-images`, `user-avatars` → set public (song-audio stays private and continues to use signed URLs).
- Add `src/lib/storage-url.ts` with `resolveImageUrl(bucket, path)` and `resolveAudioUrl(path)` helpers that return the raw string when already an `http(s)` URL and a public/signed URL otherwise.
- Normalize every `cover_url` / `avatar_url` display site (artist page, albums page, library, search, TrackRow, SongRow, MiniPlayer, NowPlaying, mobile Home/Browse/Library) through the helper.
- Mobile playback path (`SongRow` → `setTrack`) currently drops audio at raw path. Change the mobile play flow to call `getPreviewAudioUrl`/`getSignedAudioUrl` before setting the track, matching the desktop path.

## 2. Profile save

`updateProfile` looks correct, but the client sends the raw stored path back as `avatar_url`. Keep that (path is the source of truth), and just render via `resolveImageUrl("user-avatars", path)`. Verify one successful save round-trip on both desktop `/profile` and mobile profile screen and surface the DB error text via toast (already partly wired).

## 3. Spotify-style desktop now-playing

Redesign `PlayerBar.tsx`:
- Left: cover + title + artist + like.
- Center: shuffle / prev / play / next / repeat, with a full seekable progress bar (drag to scrub, shows `mm:ss / mm:ss`).
- Right: queue button, volume slider, expand.
- Uses the same `usePlayer` store; adds `volume` (0–1), `shuffle`, `repeat` to the store and wires them to the shared `<audio>` element.

## 4. Simple upload (single OR album)

Replace the two separate forms in `artist-studio.tsx` with one wizard:
- Step 1: pick "Single song" or "Album".
- Step 2: drag-drop audio file(s) + cover.
- Step 3: pricing.
  - Single: choose Free (K100 upload fee via Lenco) or Paid K10–K100.
  - Album: choose Paid K150–K250 (albums are always paid; free albums not supported).
  - Client + server validators enforce ranges; free-song path routes through the existing Lenco `initiatePayment` and only inserts the row on webhook success.
- Reuses existing `uploadFileToBucket` + `createSong`/`createAlbum` server fns; adds an `upload_fee` transaction type.

## 5. Ignore noise

The `__cf_bm` cookie warnings and `postMessage` origin errors are from the Lovable preview iframe / analytics — harmless, no code change.

## Technical notes

- Buckets flipped to public via `supabase--storage_update_bucket` (workspace must allow public buckets).
- No schema changes needed for §1–3. §4 adds one row to `payment_transactions.item_type` values (`upload_fee`) — no migration required, it's a text column.
- All fixes are additive; existing paid-song access checks stay intact.

## Out of scope this turn

Drag-and-drop page builder, subscriptions revamp, admin dashboards, buy-to-own checkout wiring — will tackle in follow-up turns once the above lands cleanly.
