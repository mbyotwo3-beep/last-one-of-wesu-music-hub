# Wesu+ v38 launch artifacts — 2026-10-21

Play Store + sideload deliverables, built from commit `64b733e`
(signing material is the repo's release keystore, Android-side only).

| File | Size | SHA-256 |
|---|---|---|
| `wesu-plus-v38.apk` | 7.40 MB | `0e086bc50b4a780fdccad5b0…` |
| `wesu-plus-v38.aab` | 7.04 MB | `17a7a4061ab3e7456159fc44…` |

- Packaging: `com.wesu.music`, `versionCode 38`, `versionName 0.0.1`, minSdk 24.
- APK verified via aapt2 badging: label "Wesu+", correct launcher activity, icon set.
- The APK/AAB are native WebView shells around the live site
  (`https://www.wesuplus.com/`), so web deploys reach installed users without a
  new versionCode.
- `public/wesuplus.apk` in the web app (the in-app sideload download) is a byte
  copy of this same v38 build (hash 0e086bc5…).

## Known-good checks before upload
- Secret scan of packaged assets: 0 service-key leaks (only benign
  "service_role" mentions in bundled JS).
- `check-store-readiness` gate: green at build time.
- Native device verification (Android 16 emulator, 2026-10-22): cold launch
  renders the live store with real catalogue, bottom-tab navigation, Library
  sign-in gate for anonymous users, airplane-mode cold launch served by the
  offline shell (171 saved pages) with the "You're offline → Downloads" chip
  and the full offline-status diagnostics panel, then live recovery after
  reconnect; `logcat` shows zero fatals/ANRs for `com.wesu.music`.
- Console-noise gate: Chromium's benign View Transition skip rejection is
  filtered in-app (commit `589cccb`, shipped to the live site the same day;
  pinned by `src/lib/__tests__/viewTransitionNoise.test.ts`).

## iOS (build on your Mac)
Everything Xcode needs is committed:
- `ios/App/App.xcworkspace` — open this, not the .xcodeproj.
- `CURRENT_PROJECT_VERSION = 38`, `MARKETING_VERSION = 0.0.1`,
  bundle id `com.wesu.music`.
- `UIBackgroundModes: [audio]`, AppIcon 1024 single-size, PrivacyInfo.xcprivacy
  present, deployment target 15.0.
- Steps: set your signing team → Product > Archive → distribute via
  Transporter/TestFlight.
