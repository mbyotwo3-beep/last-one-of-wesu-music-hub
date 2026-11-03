# Wesu+ launch artifacts

## v41 — 2026-11-03: playback self-pause fix, per-account downloads, smoothness, visibility rules

Play Store + sideload deliverables (signing material is the repo's release
keystore, Android-side only).

| File | Size | SHA-256 |
|---|---|---|
| `wesu-plus-v41.apk` | 7.40 MB (7,756,811 B) | `0327057502dcada23d246a58b03a21623f2316a306f4944a702934a19d6b93b7` |
| `wesu-plus-v41.aab` | 7.04 MB (7,381,373 B) | `ce394892153286c59302ed24cdeda8e189f7763238cc8f15614e0a11ea155cc5` |

- Packaging: `com.wesu.music`, `versionCode 41`, `versionName 0.0.1`, minSdk 24.
- `public/wesuplus.apk` + `public/wesuplus.aab` (the privately hosted
  sideload at `/wesuplus.apk`, not advertised in the UI) are byte copies of
  this same v41 build.
- **What changed vs v40:**
  - **Songs no longer stop or pause by themselves (native).** Two root
    causes fixed: a mid-track engine error (dropped connection killing the
    ExoPlayer source) used to surface a message and leave dead air — the
    player now silently reloads once with a fresh signed URL and rewinds to
    where the song died, so it CONTINUES instead of stopping (a persistently
    dead source auto-advances; offline parks with an honest message). And
    the background-priority watchdog released the foreground service after
    only ~15s of silence — long re-buffering in the background let OEM job
    killers reap playback mid-song; the window is now ~60s.
  - **Per-account downloads (Apple-style).** Vault rows now carry the owning
    user id; the downloads list, card checkmarks and offline playback are all
    scoped to the signed-in account, and the decrypt boundary refuses rows
    from another account. Rows from before scoping (no owner — unprovable
    entitlement) are purged once on first read. Fixes: downloads made under
    one account showed under any account on the same device.
  - **WebView smoothness (native).** Offscreen pre-raster (API 23+),
    renderer kept alive when paused (API 29+, `RENDERER_PRIORITY_IMPORTANT`
    never waived — no cold rebuild on resume), media playback without
    gesture so queue advance/resume never needs a tap.
  - **Web perf.** Storage-CDN preconnect + dns-prefetch (covers, artist
    images) — one TLS handshake off the first shelf paint.
  - **Artist public visibility rule.** Approved artists appear in public
    shelves, search, home and similar-artist slots only once they have ≥1
    approved song (nested `songs!inner` filter on every public listing).
    Their own profile stays visible to themselves and to staff; the public
    route 404s for everyone else.
  - **App diagnostics least privilege.** The native App diagnostics entry is
    admin/superadmin only.
  - **Actionable mobile-money error.** Lenco's "Account details was not
    found" (number not registered for MoMo) now maps to a message the buyer
    can act on instead of the generic retry line.
- **iOS (build on your Mac):** `CURRENT_PROJECT_VERSION = 41` already set in
  `ios/App/App.xcodeproj/project.pbxproj`; `MARKETING_VERSION = 0.0.1`,
  bundle id `com.wesu.music` unchanged. Open `ios/App/App.xcworkspace`, set
  your signing team → Product > Archive → distribute via
  Transporter/TestFlight.

## v40 — 2026-10-31: root-cause fix for "pages don't load in the app"

Play Store + sideload deliverables (signing material is the repo's release
keystore, Android-side only).

| File | Size | SHA-256 |
|---|---|---|
| `wesu-plus-v40.apk` | 7.40 MB (7,756,695 B) | `d60929dc98c3123207531f5f04e72264971bac3efa661b20159106a281a05870` |
| `wesu-plus-v40.aab` | 7.04 MB (7,381,250 B) | `37f77860387cfc07656d356bc15155ecf9e3ec3d677c2356712bad52f4de8c2c` |

- Packaging: `com.wesu.music`, `versionCode 40`, `versionName 0.0.1`, minSdk 24.
- `public/wesuplus.apk` (the privately hosted sideload at `/wesuplus.apk`,
  not advertised in the UI) is a byte copy of this same v40 build.
- **What changed vs v39 (native side — the one real fix):** `OfflineShell`
  classified `_serverFn` GETs as "documents", fetched them natively, and
  served the valid JSON bytes back relabeled as `text/html` with its own
  no-store headers. The page's parser therefore saw a lying content type,
  yielded nothing, and every GET-loader surface (Browse/Search shelves,
  purchase state reads) failed ONLY in the installed app while browsers were
  fine. RPCs are now volatile (never intercepted, never cached natively), and
  `serveDocument` serves any non-HTML answer with its real content type and
  caches only genuine HTML. Gate: `check-offline-shell.mjs` now asserts the
  `_serverFn` classification on the compiled class.
- The web side was already correct (`cfefab7`: per-user RPC responses are
  `Cache-Control: private, no-store`); that deploy shipped with this bug
  masked by the native relabeling.

## v39 — 2026-10-25/26 (superseded for sideload; Play AAB fallback)

| File | Size | SHA-256 |
|---|---|---|
| `wesu-plus-v39.apk` | 7.40 MB (7,756,339 B) | `593decb61e1560128ea4fe6e281238e639742d68dc5c098266c628acbf922efa` |
| `wesu-plus-v39.aab` | 7.04 MB (7,380,896 B) | `23a455b43bc3483b108f91aa38b5aac7800007c838055fafb3aa87e1faff3d9e` |
- `public/wesuplus.apk` in the web app (the privately hosted sideload download
  at `/wesuplus.apk`, not advertised in the UI) is a byte copy of this same v39
  build (hash 593decb6…).

## What changed vs v38 (native side)
- One-shot media-listener patch for `@capgo/native-audio` 7.11.2:
  `android/patches/capgo-native-audio-7.11.2/RemoteAudioAsset.java`. The stock
  plugin registered a fresh completion/end listener on every replay of the same
  asset, stacking listeners that double-advanced the queue. Before any future
  gradle build, copy the patched file over
  `node_modules/@capgo/native-audio/android/src/main/java/ee/forgr/audio/RemoteAudioAsset.java`
  (the repo patch file is the source of truth; node_modules is not committed).
- Ghost-listener patch: stale native callbacks from destroyed asset ids are
  dropped in the same patched file, so a rejoined session cannot inherit
  phantom completion events.
- The mid-play pause family was root-caused as environmental (starved
  transport), with app logic verified correct by instrumentation; the
  reconciler engine-alive guard from the sweep lives in the web bundle.

## Known-good checks before upload
- Secret scan of packaged assets: 0 service-key leaks (only benign
  "service_role" mentions in bundled JS).
- `check-store-readiness` gate: green at build time.
- Native device verification (Android emulator, 2026-10-26 sweep): cold launch
  renders the live store with real catalogue (hero shelves, prices, download
  affordances); offline download confirmed Spotify-style — a song downloaded to
  the encrypted vault ("1 song · 5.8 MB · encrypted, plays only in Wesu+"),
  state surviving app force-stops and relaunches at Library and shelf level;
  route crash family (map/filter on corrupted transport envelopes) eliminated
  at the render boundaries with graceful empty states; typecheck clean.
- The web layer inside the shell is versioned by commit, so shipping the site
  does not require re-signing the APK/AAB above.

## iOS (build on your Mac)
Everything Xcode needs is committed:
- `ios/App/App.xcworkspace` — open this, not the .xcodeproj.
- `CURRENT_PROJECT_VERSION = 41`, `MARKETING_VERSION = 0.0.1`,
  bundle id `com.wesu.music`.
- `UIBackgroundModes: [audio]`, AppIcon 1024 single-size, PrivacyInfo.xcprivacy
  present, deployment target 15.0.
- Steps: set your signing team → Product > Archive → distribute via
  Transporter/TestFlight.
