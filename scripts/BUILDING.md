# Building and releasing the apps

Both apps are **WebView shells around https://www.wesuplus.com/**. No web code
ships in them — the APK and IPA carry no application logic, no database
credentials and no Lenco keys. Every fix on the site reaches installed apps
without a rebuild.

That has one consequence worth stating loudly: **ship the web app before you
upload the app.** An app that is newer than the site it loads will simply show
the old site.

---

## Android (this machine)

```bash
./scripts/build-android.sh          # both APK and AAB
./scripts/build-android.sh apk      # sideload APK only
./scripts/build-android.sh bundle   # Play Store AAB only
```

Or, exactly as vc30 was built:

```bash
npm run build
npx cap sync android
node scripts/apply-native-audio-patch.mjs
cd android && gradlew.bat clean assembleRelease bundleRelease
```

Output lands in `build/android/` and is copied to the repo root as
`wesuplus.apk` / `wesuplus.aab`.

### Signing

`android/app/keystore.properties` (gitignored) points at
`android/app/wesu-release.keystore`. **Back both up somewhere you will still
have in a year.** Losing the keystore means you can never update the app again
for existing users — not a new build, not a support fix, nothing.

Current certificate, for confirming a build upgrades cleanly:

```
SHA-256  1f4ad3a98ea90f6d70e0a1ad03ada069722f051ecdf918961c5c7eeff6f18283
```

### versionCode

Must strictly increase every upload or Play rejects it. Currently **30**. When
you cut the next build, edit `versionCode` in `android/app/build.gradle` and
`CURRENT_PROJECT_VERSION` in the Xcode project in the same commit so the two
platforms stay aligned.

---

## iOS (needs a Mac)

Everything possible was done here. What remains needs Xcode and an Apple
Developer account.

```bash
./scripts/build-ios.sh              # sync, build, verify, package
./scripts/build-ios.sh --verify-only  # just re-run the gates
```

The script builds, then **verifies the built `.app` itself** — reading
`server.url` out of the bundle's own `capacitor.config.json`, confirming
`PrivacyInfo.xcprivacy` is inside it, and failing on a typo'd domain. Those are
the checks you cannot do without a Mac, so it does them for you.

### For an actual App Store / TestFlight upload

The script does **not** sign anything. That is deliberate: signing silently picks
an identity, and a wrong pick produces an archive you cannot upload.

```bash
open ios/App/App.xcworkspace
```

Then in Xcode:

1. Select the **App** scheme, destination **Any iOS Device (arm64)**
2. **Signing & Capabilities** → pick your Team
3. **Product → Archive**
4. Distribute App → App Store Connect

Use the `.xcworkspace`, not the `.xcproject` — the workspace is what includes
the SPM package that holds the Capacitor plugins.

If `build-ios.sh` reports an SPM resolution failure, open the workspace once and
let Xcode resolve `CapApp-SPM`; it caches the graph and the script's checks will
then pass.

---

## Gates

`npm run build` runs all of these before it compiles anything. They also run
individually:

| Command | What it protects |
| --- | --- |
| `npm run verify:app-url` | Every app copy points at the same host |
| `npm run verify:ios-project` | The Xcode project will open |
| `npm run verify:store-ready` | Nothing here gets rejected at upload |
| `npm run verify:offline-mode` | The player only queues what is on the device |
| `npm run verify:no-secrets` | No credential inside the APK |
| `npm run verify:hover-controls` | No control reachable only by hover |
| `npm run verify:revenue-split` | Deduction and payout agree on who is payable |

`check-app-url` exists because that mistake was already made once: the iOS
generated config pointed at `https://www.wesuplusly.com/` — an extra `ly`. Every
iOS build would have shown a permanently white screen, and nothing on this
machine would have revealed it, because the Android copy and the root
`capacitor.config.ts` were both correct.

---

## What none of this verifies

These need a real device, and no gate can substitute:

- background playback surviving a phone call
- lock-screen and notification transport controls
- whether a download survives the OS killing the app mid-download
- whether storage is partitioned in your customers' WebViews (which is why the
  Offline-mode switch also persists to a cookie)
- the offline vault decrypting a full album on a cold start with no bars

Test those on hardware before you push paid traffic.