# Wesu+ — Mobile (Capacitor) Setup

The web app (this Lovable project) and the Android app share **one codebase**
and **one Supabase backend**, but render **different UIs** depending on the
runtime. Use the `usePlatform()` hook to branch.

## Backend

Same project, same `.env` values. Capacitor bundles the web build into the
APK, so `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are baked in
at build time — no extra config needed.

## Running on Android Studio

1. Pull the repo locally (after connecting GitHub from Lovable).
2. Install deps:
   ```bash
   bun install
   ```
3. Build the web bundle:
   ```bash
   bun run build
   ```
4. Add the Android platform (first time only):
   ```bash
   bunx cap add android
   ```
5. Copy the latest web build into the native project:
   ```bash
   bunx cap sync
   ```
6. Open in Android Studio:
   ```bash
   bunx cap open android
   ```
7. Press ▶️ in Android Studio to run on an emulator or device.

Re-run `bun run build && bunx cap sync` after every web change.

### Live-reload during dev (optional)

Uncomment the `server.url` block in `capacitor.config.ts` and point it at
your Lovable preview URL or local dev server (`http://10.0.2.2:3000` for the
emulator). Then `bunx cap sync` and run.

## Designing different UIs for web vs mobile

Use the `usePlatform()` hook:

```tsx
import { usePlatform } from "@/hooks/use-platform";

export default function HomePage() {
  const platform = usePlatform();
  return platform === "native" ? <MobileHome /> : <WebHome />;
}
```

Recommended folder convention:

```
src/
  components/
    web/          ← desktop/browser-only components, big hero, etc.
    mobile/       ← native-feel screens, bottom tab bar, swipe gestures
    shared/       ← used by both (audio player logic, types)
```

This way the web stays editorial/magazine-style and the app feels like a
proper native music player — different layouts, different buttons, different
navigation — while both hit the same Supabase tables.

## Permissions / native plugins

When you need things like audio background playback, push notifications, or
file downloads, install the matching Capacitor plugin:

```bash
bun add @capacitor/<plugin-name>
bunx cap sync
```

Common ones for a music app:

- `@capacitor/filesystem` — offline song downloads
- `@capacitor/preferences` — persisted settings
- `@capacitor/share` — share songs/albums
- `@capgo/native-audio` (third-party) — background audio playback

## Android app features (shipped in the release AAB/APK)

Shell: `com.wesu.music` / "Wesu+", fullscreen WebView around the live site
(`server.url`), no address bar, branded splash (`#fbf7ee`) + status bar,
adaptive/launcher icons and splash generated from `public/images/wesu-logo.png`.

- **Playback** — `@capgo/native-audio` with `background + showNotification +
  focus`: background audio, notification-bar player, lock-screen controls
  with cover art; in-app UI reconciles with lock-screen/notification buttons.
- **Offline** — encrypted on-device vault (AES-GCM, device-bound key,
  IndexedDB); downloads play only inside the app; bulk download per playlist.
- **Error screen** — load failures show a branded offline page with retry;
  raw URLs are never displayed (Facebook-style).
- **Back button** — navigates web history, otherwise backgrounds the app
  (`moveTaskToBack`) so playback survives; reopening restores state.
- **Deep links** — `com.wesu.music://login-callback…` opens the app and
  completes Supabase auth (magic-link / OAuth / PKCE code exchange).
- **Nav** — max 5 bottom-bar items (Home/Browse/Library/Search/Menu);
  everything else lives in the Menu sheet. Safe-area insets throughout.

Release signing: `android/app/wesu-release.keystore` (gitignored) +
`android/app/keystore.properties`. Back both up privately — losing them
means the app can never be updated. Rebuild with:
`npx cap sync android && gradlew bundleRelease assembleRelease`.

## iOS (later, needs Xcode on macOS)

No `ios/` platform in this repo yet — add it there with `npx cap add ios`.
Code-level iOS readiness is done: platform branching is native-vs-web
(`usePlatform`), splash/status-bar config has an `ios` section, downloads
use the cross-platform Filesystem bridge, and `@capgo/native-audio`
supports iOS background + Control Center with the same JS API.
