# Wesu+ launch artifacts

## v43 — 2026-11-04: the real "stops at ~9 seconds online" fix (double engine + reconciler)

Play Store + sideload deliverables (signing material is the repo's release
keystore, Android-side only).

| File | Size | SHA-256 |
|---|---|---|
| `wesu-plus-v43.apk` | 7.40 MB (7,757,139 B) | `3cfb4b530594ce0a312840f18be66acb499e4e2c4e21c2d1ee40e3b4b11321c1` |
| `wesu-plus-v43.aab` | 7.04 MB (7,381,717 B) | `7e971297c4a8551572f369b1dfbb77074cedae1ef0ad959a8059f1b78208a339` |

- Packaging: `com.wesu.music`, `versionCode 43`, `versionName 0.0.1`, minSdk 24.
- `public/wesuplus.apk` + `public/wesuplus.aab` (the privately hosted
  sideload at `/wesuplus.apk`, not advertised in the UI) are byte copies of
  this same v43 build.
- **What changed vs v42 — the actual "song stops/pauses by itself online"
  root cause chain, reproduced and fixed on device:**
  - **Two engines played the same song at once.** On a cold start the web
    view resolved the track's signed URL through the HTML `<audio>` element
    first (the platform probe reports "web" on the very first render), and
    its late-finishing `canplay` listener started the element UNDER the live
    native ExoPlayer engine. Both engines streamed the same URL, splitting
    bandwidth. The element is now detached the moment the native branch
    owns the selection, and every late web-path continuation (URL resolution,
    retry passes, `canplay`, play-state sync) refuses to touch the element
    while native is available.
  - **A network re-buffer was mistaken for a lock-screen pause.** ExoPlayer
    drops `isPlaying` and stops position ticks during every re-buffer; the
    remote-control reconciler adopted that as a user pause after ~2.5s of
    stale ticks and paused the engine mid-buffer — dead air a few seconds
    into the song (the "mostly at 9 seconds" report: the still-alive HTML
    element kept rendering alone for ~9s, then hit its clip end and
    everything stopped). Two layers: the native `RemoteAudioAsset` timer now
    keeps ticking through `BUFFERING` (with play intent) so the JS side
    always knows the engine is alive, and the reconciler's stale-tick window
    widened to 8s as the belt for engines that can't do this (iOS).
  - **Shade play/pause now announces itself.** The plugin's MediaSession
    callbacks dispatch `remotePause`/`remotePlay` to JS, so the UI follows a
    real shade pause instantly instead of waiting out the stale-tick window.
  - Also carries v42's fixes (notification body tap opens the app;
    versionCode bump so the self-pause fixes actually install over field
    builds).
- **iOS (build on your Mac):** `CURRENT_PROJECT_VERSION = 43` already set in
  `ios/App/App.xcodeproj/project.pbxproj`; `MARKETING_VERSION = 0.0.1`,
  bundle id `com.wesu.music` unchanged. Open `ios/App/App.xcworkspace`, set
  your signing team → Product > Archive → distribute via
  Transporter/TestFlight.

## v42 — 2026-11-03: notification tap-to-open + the self-pause fixes ship to phones

Play Store + sideload deliverables (signing material is the repo's release
keystore, Android-side only).

| File | Size | SHA-256 |
|---|---|---|
| `wesu-plus-v42.apk` | 7.40 MB (7,757,027 B) | `03a743e82c61517a47bfbefe6ce95044273321f49397952c86d7d9e82b277fa2` |
| `wesu-plus-v42.aab` | 7.04 MB (7,381,572 B) | `85e76532740f453027c5730c0efcb59598060c34ff521583dd59696e0467bff6` |

- Packaging: `com.wesu.music`, `versionCode 42`, `versionName 0.0.1`, minSdk 24.
- `public/wesuplus.apk` + `public/wesuplus.aab` (the privately hosted
  sideload at `/wesuplus.apk`, not advertised in the UI) are byte copies of
  this same v42 build.
- **What changed vs v41:**
  - **Tapping the player notification opens the app.** The media
    notification body (anywhere that isn't the Previous / Play-Pause / Next
    buttons) had no content intent — taps were a dead zone. It now carries a
    launcher PendingIntent that brings the existing task to the front.
  - **The v41 self-pause fixes actually reach phones.** v41 binaries kept
    the same versionCode as the original build, so Android blocked
    same-version reinstalls and users kept running the old code — which is
    why online playback still "paused itself mostly at 9 seconds" for them.
    v42 bumps `versionCode` to 42 (iOS `CURRENT_PROJECT_VERSION` to 42), so
    the audio-focus race fix, the engine-error recovery, and the 60s
    watchdog all install over the old build. The Menu footer's build stamp
    confirms which binary a phone runs.
- **iOS (build on your Mac):** `CURRENT_PROJECT_VERSION = 42` already set in
  `ios/App/App.xcodeproj/project.pbxproj`; `MARKETING_VERSION = 0.0.1`,
  bundle id `com.wesu.music` unchanged. Open `ios/App/App.xcworkspace`, set
  your signing team → Product > Archive → distribute via
  Transporter/TestFlight.

## v41 — 2026-11-03: playback self-pause fix, per-account downloads, smoothness, visibility rules

Play Store + sideload deliverables (signing material is the repo's release
keystore, Android-side only).

| File | Size | SHA-256 |
|---|---|---|
| `wesu-plus-v41.apk` | 7.40 MB (7,756,675 B) | `16034e9fc527a9ff2aefa389f65bdd5821eb8ff2d61959ab1f97d730da03905e` |
| `wesu-plus-v41.aab` | 7.04 MB (7,381,226 B) | `a6d709b5ad839935e4b8b918fb59d8f6599027c8697f5081686d9d2a1ceb2c05` |

- Packaging: `com.wesu.music`, `versionCode 41`, `versionName 0.0.1`, minSdk 24.
- `public/wesuplus.apk` + `public/wesuplus.aab` (the privately hosted
  sideload at `/wesuplus.apk`, not advertised in the UI) are byte copies of
  this same v41 build.
- **What changed vs v40:**
  - **Songs no longer stop or pause by themselves (native).** Three root
    causes fixed: a mid-track engine error (dropped connection killing the
    ExoPlayer source) used to surface a message and leave dead air — the
    player now silently reloads once with a fresh signed URL and rewinds to
    where the song died, so it CONTINUES instead of stopping (a persistently
    dead source auto-advances; offline parks with an honest message). And
    the background-priority watchdog released the foreground service after
    only ~15s of silence — long re-buffering in the background let OEM job
    killers reap playback mid-song; the window is now ~60s. And the WebView's
    Chromium AudioFocusDelegate requests then abandons audio focus, which
    dispatched AUDIOFOCUS_LOSS to the NativeAudio engine — the old handler
    only tracked assets already marked playing, so a focus loss landing in
    the tiny window between play() and the engine marking the asset playing
    left the song paused forever; the handler now tracks every asset on
    focus loss so GAIN always resumes playback.
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
