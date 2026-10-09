#!/usr/bin/env bash
#
# Build the Android release APK (sideload) and AAB (Play Store).
#
# This wraps the same Gradle invocation that has produced every shipped build,
# with the secrets handled explicitly rather than by hoping a file exists.
#
# USAGE
#
#   ./scripts/build-android.sh          build both
#   ./scripts/build-android.sh apk      sideload APK only
#   ./scripts/build-android.sh bundle   Play Store AAB only
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WHAT="${1:-all}"
OUT="$ROOT/build/android"
mkdir -p "$OUT"

say() { printf '\n=== %s ===\n' "$1"; }

say "checking the toolchain"
if ! command -v java >/dev/null 2>&1; then
  echo "java not found. Install a JDK 17+, or set JAVA_HOME." >&2
  exit 1
fi
echo "  java $(java -version 2>&1 | head -1)"

PROPS="android/app/keystore.properties"
if [ ! -f "$PROPS" ]; then
  echo "  FAIL $PROPS is missing — this build would be UNSIGNED." >&2
  echo "  An unsigned APK cannot be installed and cannot upgrade an existing" >&2
  echo "  install; Play Console rejects the AAB outright." >&2
  echo "  It is gitignored on purpose, so this is expected on CI — but never" >&2
  echo "  when building the release you intend to ship." >&2
  exit 1
fi
STORE_FILE="$(sed -n 's/^storeFile=//p' "$PROPS" | tr -d '[:space:]')"
if [ -z "$STORE_FILE" ] || [ ! -f "android/app/$STORE_FILE" ]; then
  echo "  FAIL $PROPS points at '${STORE_FILE:-<empty>}', which does not exist." >&2
  exit 1
fi
echo "  signing keystore present ($STORE_FILE)"

# The store gates deliberately do NOT require the keystore: they run on the web
# deploy, where it is correctly absent. Here it is mandatory, so it is enforced
# above rather than by a prebuild gate that would also fire in the wrong place.

say "web build (the app is a shell around the live site)"
npm run build

say "syncing native project"
npx cap sync android
# The native audio patches are not in node_modules (not committed), so they are
# reapplied on every sync. Idempotent.
node scripts/apply-native-audio-patch.mjs

say "store gates"
node scripts/check-app-url.mjs
node scripts/check-store-readiness.mjs

# The APK is scanned for credentials. A WebView shell must never carry one:
# anything in the binary can be extracted by anyone who unzips it.
if [ -f wesuplus.apk ]; then
  node scripts/scan-apk-secrets.mjs wesuplus.apk
fi

say "gradle release build"
TASKS=()
case "$WHAT" in
  apk)    TASKS=(assembleRelease) ;;
  bundle) TASKS=(bundleRelease) ;;
  all)    TASKS=(assembleRelease bundleRelease) ;;
  *) echo "usage: $0 [apk|bundle|all]" >&2; exit 2 ;;
esac

( cd android && ./gradlew.bat clean "${TASKS[@]}" --no-daemon --console=plain ) \
  || ( cd android && ./gradlew clean "${TASKS[@]}" --no-daemon --console=plain )

say "verifying what came out"
APK="android/app/build/outputs/apk/release/app-release.apk"
AAB="android/app/build/outputs/bundle/release/app-release.aab"

copy_out() {
  src="$1"; dest="$2"
  if [ ! -f "$src" ]; then
    echo "  WARNING $src was not produced" >&2
    return 0
  fi
  cp "$src" "$dest"
  size="$(du -h "$dest" | cut -f1)"
  echo "  $dest ($size)"
}

if [ -f "$APK" ]; then copy_out "$APK" "$OUT/wesuplus.apk"; fi
if [ -f "$AAB" ]; then copy_out "$AAB" "$OUT/wesuplus.aab"; fi

# aapt2 lives in the Android SDK build-tools; find it rather than guessing a
# version, because the newest installed is the one that matches.
AAPT2="$(find "${ANDROID_HOME:-$HOME/Library/Android/sdk}/build-tools" -name aapt2 -type f 2>/dev/null | sort | tail -1)"
if [ -n "$AAPT2" ] && [ -f "$OUT/wesuplus.apk" ]; then
  echo "  manifest:"
  "$AAPT2" dump badging "$OUT/wesuplus.apk" 2>/dev/null \
    | grep -E "^(package|sdkVersion|targetSdkVersion|application-label)" | sed 's/^/    /'
fi

say "scanning the new apk for credentials"
if [ -f "$OUT/wesuplus.apk" ]; then
  node scripts/scan-apk-secrets.mjs "$OUT/wesuplus.apk"
fi

cat <<EOF

=== done ===

  $OUT/wesuplus.apk   install on a device:  adb install -r $OUT/wesuplus.apk
  $OUT/wesuplus.aab   upload to Play Console (requires keystore.properties)

  versionCode must keep increasing or Play rejects the upload.
  Keep android/app/wesu-release.keystore and keystore.properties backed up
  somewhere safe: losing them means you can never update the app again.
EOF