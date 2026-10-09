#!/usr/bin/env bash
#
# Build and archive the iOS app. Run this on a Mac; nothing here works on
# Windows, because it needs Xcode.
#
# WHAT IT DOES
#
#   1. sync  — regenerates ios/App/App/capacitor.config.json and CapApp-SPM from
#              capacitor.config.ts and package.json. Skipped with --skip-sync when
#              you only changed native code.
#   2. build — an unsigned Release build for "Any iOS Device (arm64)".
#   3. verify — the same checks scripts/check-ios-project.mjs runs, re-run on the
#              Mac so a broken pbxproj fails here rather than in App Store
#              Connect. Node is required for this step.
#   4. zip   — a .ipa containing App.app, ready for a sideload or TestFlight
#              upload. An IPA cannot be uploaded to the App Store directly;
#              App Store Connect wants a .xcarchive or an .ipa via Transporter,
#              and that needs your signing identity (see below).
#
# SIGNING
#
# This script does not sign. That is deliberate: signing needs your Apple
# Developer identity, and a script that silently picks the wrong one produces an
# archive you cannot upload. For a device build, open ios/App/App.xcworkspace in
# Xcode, pick your team under Signing & Capabilities, and let it provision.
#
# USAGE
#
#   ./scripts/build-ios.sh                 sync, build, verify, zip
#   ./scripts/build-ios.sh --skip-sync     native-only changes
#   ./scripts/build-ios.sh --verify-only   just re-run the checks
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SCHEME="App"
PROJECT="ios/App/App.xcodeproj"
WORKSPACE="ios/App/App.xcworkspace"
DERIVED="$HOME/Library/Developer/Xcode/DerivedData"
OUT="$ROOT/build/ios"
BUNDLE_ID="com.wesu.music"

SKIP_SYNC=0
VERIFY_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-sync)   SKIP_SYNC=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n=== %s ===\n' "$1"; }

# ---------------------------------------------------------------- preflight
say "checking this is actually a Mac with Xcode"
if [ "$(uname -s)" != "Darwin" ]; then
  echo "iOS builds need macOS. This is $(uname -s)." >&2
  echo "Run this on the MacBook, from the same checkout." >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild not found. Install Xcode from the App Store, then:" >&2
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi
echo "  xcodebuild $(xcodebuild -version | head -1 | awk '{print $2}')"

# Node is needed for the gates. npx is present whenever the repo was installed.
if ! command -v node >/dev/null 2>&1; then
  echo "node not found. Install Node 20+ so the prebuild gates can run." >&2
  exit 1
fi

# ---------------------------------------------------------------- sync
if [ "$VERIFY_ONLY" -eq 0 ] && [ "$SKIP_SYNC" -eq 0 ]; then
  say "building the web app the app will load"
  npm run build

  say "syncing native projects"
  # Regenerates the generated config + plugin list. This is what fixed the
  # wesuplusly.com typo — the stale copy is what the app actually boots, so it
  # must be regenerated rather than trusted.
  npx cap copy ios
  node scripts/apply-native-audio-patch.mjs || true
fi

# ---------------------------------------------------------------- gates
say "store gates"
node scripts/check-app-url.mjs
node scripts/check-ios-project.mjs
node scripts/check-store-readiness.mjs

# ---------------------------------------------------------------- build
if [ "$VERIFY_ONLY" -eq 1 ]; then
  say "verify only — stopping before the build"
  exit 0
fi

say "archive (unsigned, arm64)"
mkdir -p "$OUT"
# -destination generic/platform=iOS builds a device archive. No signing identity
# is supplied, so this cannot silently use the wrong certificate.
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build

APP_PATH="$(find "$DERIVED" -type d -name 'App.app' -path '*Release-iphoneos*' | head -1)"
if [ -z "$APP_PATH" ]; then
  echo "build reported success but no App.app was produced." >&2
  echo "Look for the error above — usually a missing SPM dependency." >&2
  exit 1
fi
echo "  built $APP_PATH"

# ---------------------------------------------------------------- verify
say "verifying the built app"
BUILT_PLIST="$APP_PATH/Info.plist"
for key in CFBundleShortVersionString CFBundleVersion CFBundleIdentifier; do
  v="$(/usr/libexec/PlistBuddy -c "Print :$key" "$BUILT_PLIST")"
  printf '  %-26s %s\n' "$key" "$v"
done

# The generated config ships INSIDE the bundle, so this is the value the app will
# actually use at runtime — not the file in the repo.
BUILT_CFG="$APP_PATH/capacitor.config.json"
if [ ! -f "$BUILT_CFG" ]; then
  echo "  FAIL capacitor.config.json is not inside the bundle — the app would show a blank screen" >&2
  exit 1
fi
BUILT_URL="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$BUILT_CFG','utf8')).server.url)")"
echo "  bundled server.url        $BUILT_URL"
case "$BUILT_URL" in
  *wesuplusly*) echo "  FAIL that is a typo'd domain, not the real site" >&2; exit 1 ;;
  *wesuplus.com/*) ;;
  *) echo "  FAIL unexpected host: $BUILT_URL" >&2; exit 1 ;;
esac

if [ ! -f "$APP_PATH/PrivacyInfo.xcprivacy" ]; then
  echo "  FAIL PrivacyInfo.xcprivacy is not in the bundle — App Store rejects the upload" >&2
  exit 1
fi
echo "  PrivacyInfo.xcprivacy     present"

if [ ! -f "$APP_PATH/AppIcon60x60@3x.png" ] && [ -z "$(find "$APP_PATH" -name 'AppIcon*' | head -1)" ]; then
  echo "  FAIL no app icon in the bundle" >&2
  exit 1
fi
echo "  app icon                   present"

# ---------------------------------------------------------------- zip
say "packaging an ipa"
IPA="$OUT/wesuplus-$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$BUILT_PLIST")-$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$BUILT_PLIST").ipa"
rm -rf "$OUT/Payload"
mkdir -p "$OUT/Payload"
cp -R "$APP_PATH" "$OUT/Payload/"
# A sideload/TestFlight .ipa needs a Swift-style bundle, not an ad-hoc one.
( cd "$OUT" && zip -qry "$(basename "$IPA")" Payload )
rm -rf "$OUT/Payload"
echo "  $IPA"

cat <<EOF

=== done ===

For the App Store / TestFlight, use Xcode instead of this .ipa:
  open $WORKSPACE
  select the App scheme, Any iOS Device (arm64), your team under
  Signing & Capabilities, then Product > Archive.

This .ipa is UNSIGNED. For a device you will need to sign it with your
profile, or use Xcode's Run button with a free personal team.

Reminders that are not checked here:
  - the app is a WebView on https://www.wesuplus.com/, so ship the web app
    BEFORE uploading, or the app opens last week's site
  - background audio and the lock-screen player only work on real hardware
  - test a phone call interrupting playback, then Offline mode with no bars
EOF