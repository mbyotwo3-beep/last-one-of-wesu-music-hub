/**
 * Everything a store submission rejects AFTER the build succeeds.
 *
 * These are the checks you can do in minutes on Windows that Apple and Google
 * will otherwise tell you about days later, when the upload is rejected and the
 * answer is a form to fill in. Each one below has either already bitten this
 * project or is a documented rejection reason.
 *
 * WHAT IS NOT CHECKED HERE
 *
 * Whether the code compiles, whether the native player works, whether audio
 * survives a phone call. That needs Xcode and a device. This file is about
 * paperwork, config drift and metadata — the things that are silently wrong.
 *
 * Usage: node scripts/check-store-readiness.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const problems = [];
const notes = [];

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

// ---------------------------------------------------------------- Android
const gradle = read("android/app/build.gradle");
if (gradle) {
  const code = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1] ?? 0);
  const name = /versionName\s+"([^"]+)"/.exec(gradle)?.[1] ?? "";

  if (!code) problems.push("android: no versionCode");
  // Google Play requires the bundle's versionCode to exceed the last upload.
  if (code < 1) problems.push(`android: versionCode ${code} is not positive`);
  notes.push(`android  versionName ${name}, versionCode ${code}`);

  // A release build that is not signed cannot be uploaded and cannot be
  // upgraded over later. Unsigned-if-missing is convenient locally and fatal
  // here, so it is called out loudly rather than left to the store.
  const props = read("android/app/keystore.properties");
  const storeFile = props ? /storeFile\s*=\s*(.+)/.exec(props)?.[1]?.trim() : null;
  if (!props) {
    problems.push("android: keystore.properties is absent — the release build will be UNSIGNED");
  } else if (!storeFile || !existsSync(`android/app/${storeFile}`)) {
    problems.push(`android: keystore.properties points at ${storeFile}, which does not exist`);
  } else {
    notes.push(`android  release keystore present (${storeFile})`);
  }

  // minSdk is a floor decided by requirement, not preference.
  const vars = read("android/variables.gradle");
  const min = Number(/minSdkVersion\s*=\s*(\d+)/.exec(vars ?? "")?.[1] ?? 0);
  if (min < 24) {
    problems.push(`android: minSdk ${min} is below 24; Capacitor 8 does not support it`);
  } else {
    notes.push(
      `android  minSdk ${min}, targetSdk ${/targetSdkVersion\s*=\s*(\d+)/.exec(vars ?? "")?.[1] ?? "?"}`,
    );
  }
}

// Google Play requires 64-bit. A 32-bit-only bundle is rejected outright.
const abi = read("android/app/build.gradle");
if (abi && /abiFilters/.test(abi)) {
  const filters = /abiFilters\s+(.*)/.exec(abi)?.[1] ?? "";
  if (/armeabi-v7a/.test(filters) && !/arm64-v8a/.test(filters)) {
    problems.push("android: abiFilters lists only 32-bit — Google Play requires arm64-v8a");
  }
}

// ---------------------------------------------------------------- iOS
const info = read("ios/App/App/Info.plist");
if (info) {
  // Background audio: without this the WebView is suspended the moment the app
  // leaves the foreground, so music stops when the phone is locked. This is the
  // whole point of the lock-screen requirement.
  if (!/<key>UIBackgroundModes<\/key>[\s\S]*?<string>audio<\/string>/.test(info)) {
    problems.push("ios: UIBackgroundModes does not include 'audio' — playback stops on lock");
  } else {
    notes.push("ios     UIBackgroundModes: audio");
  }

  // Declaring the 32-bit ABI excludes every device that can run iOS 15+.
  if (/<string>armv7<\/string>/.test(info)) {
    problems.push("ios: UIRequiredDeviceCapabilities lists armv7 (32-bit); must be arm64");
  }

  if (!/ITSAppUsesNonExemptEncryption/.test(info)) {
    problems.push(
      "ios: ITSAppUsesNonExemptEncryption absent — every upload triggers export review",
    );
  }

  // An accidental typo in the launch screen name ships an app that shows a white
  // rectangle forever.
  for (const key of ["UILaunchStoryboardName", "UIMainStoryboardFile"]) {
    const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`).exec(info);
    const name = m?.[1];
    if (!name) {
      problems.push(`ios: ${key} is not set`);
      continue;
    }
    // Localized resources live in Base.lproj WITH the .storyboard extension.
    const p = `ios/App/App/Base.lproj/${name}.storyboard`;
    if (!existsSync(p)) problems.push(`ios: ${key} points at ${name}, which does not exist`);
  }
}

const icons = read("ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json");
if (icons) {
  if (!/1024x1024/.test(icons)) {
    problems.push("ios: AppIcon has no 1024x1024 entry — App Store validation fails");
  }
  if (!existsSync("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")) {
    problems.push("ios: AppIcon-1024.png is referenced but missing");
  }
}

// Apple's 1024 icon must be opaque with no alpha channel, or validation rejects
// it. This is checkable here without a Mac.
try {
  const png = readFileSync("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png");
  // Colour type 6 = RGBA (has alpha), 4 = greyscale+alpha, 3 = palette.
  const colourType = png[25];
  if (colourType === 6 || colourType === 4 || colourType === 3) {
    problems.push(
      `ios: AppIcon-1024.png has an alpha channel (colour type ${colourType}); App Store requires opaque`,
    );
  } else {
    notes.push("ios     AppIcon 1024x1024, opaque");
  }
} catch {
  problems.push("ios: AppIcon-1024.png could not be read");
}

if (!existsSync("ios/App/App/PrivacyInfo.xcprivacy")) {
  problems.push("ios: PrivacyInfo.xcprivacy missing — required for App Store submission");
} else {
  notes.push("ios     PrivacyInfo.xcprivacy present");
}

// Deployment target vs what Capacitor 8 supports.
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
if (pbx) {
  const targets = [
    ...new Set([...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+)/g)].map((m) => m[1])),
  ];
  if (targets.some((t) => Number(t) < 14)) {
    problems.push(
      `ios: IPHONEOS_DEPLOYMENT_TARGET ${targets.join("/")} is below Capacitor 8's floor of 14`,
    );
  } else {
    notes.push(`ios     deployment target ${targets.join("/")}`);
  }
}

// ---------------------------------------------------------------- both
// The Swift package list is generated. If it drifts from package.json, an iOS
// build compiles against a plugin that is not there and fails at link time.
const spm = read("ios/App/CapApp-SPM/Package.swift");
if (spm) {
  const pkg = read("package.json");
  if (pkg) {
    // Only packages that SHIP an iOS native implementation belong in Package.swift.
    // @capacitor/android, /cli, /core, /ios and /synapse are build tooling or the
    // other platform: they have no ios/ directory and including them is wrong.
    // An earlier version of this check listed all five as failures — they are
    // absent on purpose.
    const capDeps = Object.keys(JSON.parse(pkg).dependencies ?? {}).filter(
      (d) => /@capacitor\/|@capgo\//.test(d) && existsSync(`node_modules/${d}/ios`),
    );
    for (const d of capDeps) {
      const short = d.split("/").pop();
      if (!new RegExp(`\\b${short}\\b`).test(spm)) {
        problems.push(`ios: ${d} is installed but missing from CapApp-SPM/Package.swift`);
      }
    }
    notes.push(`ios     ${capDeps.length} Capacitor plugin(s) wired into CapApp-SPM`);
  }
}

// The generated iOS Capacitor config must be able to see every plugin the
// Android one can, or a plugin silently no-ops on iOS only.
const iosCfg = read("ios/App/App/capacitor.config.json");
const androidCfg = read("android/app/src/main/assets/capacitor.config.json");
if (iosCfg && androidCfg) {
  const iosList = JSON.parse(iosCfg).packageClassList ?? [];
  const andList = JSON.parse(androidCfg).packageClassList ?? [];
  const missing = andList.filter((p) => !iosList.includes(p));
  if (missing.length) {
    problems.push(
      `ios: packageClassList is missing ${missing.join(", ")} — plugins would no-op on iOS`,
    );
  }
  // The iOS copy was generated before this build and drifts independently.
  for (const key of ["server", "ios", "plugins"]) {
    const a = JSON.stringify(JSON.parse(androidCfg)[key]);
    const b = JSON.stringify(JSON.parse(iosCfg)[key]);
    if (a !== b) {
      problems.push(
        `ios: "${key}" differs from Android's copy — the platforms would behave differently\n        android: ${a}\n        ios:     ${b}`,
      );
    }
  }
}

console.log("  store readiness");
for (const n of notes) console.log(`    ${n}`);

if (problems.length) {
  console.error("");
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error(`\n  ${problems.length} thing(s) a store would reject`);
  process.exit(1);
}
console.log("  nothing here would be rejected at upload");
