// Reapplies the Wesu patches to @capgo/native-audio after fresh installs
// (node_modules isn't committed). Idempotent: each file is skipped when its
// marker is already present. Safe no-op when the package is absent (e.g. a
// web-only environment).
//
//   NativeAudio.java     — background lifecycle, audio focus, lock-screen
//                          transport actions, live notification rebuild.
//   RemoteAudioAsset.java — partial wake lock so streaming doesn't gap on
//                          low-RAM phones with the screen off.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(
  root,
  "node_modules/@capgo/native-audio/android/src/main/java/ee/forgr/audio",
);
const patchDir = join(root, "android/patches/capgo-native-audio-7.11.2");
const MARKER = "WESU PATCH";
const FILES = ["NativeAudio.java", "RemoteAudioAsset.java"];

try {
  if (!existsSync(packageDir) || !existsSync(patchDir)) process.exit(0);
  for (const file of FILES) {
    const target = join(packageDir, file);
    const source = join(patchDir, file);
    if (!existsSync(target) || !existsSync(source)) continue;
    if (readFileSync(target, "utf8").includes(MARKER)) {
      console.log(`[wesu] native-audio ${file} already patched`);
      continue;
    }
    copyFileSync(source, target);
    console.log(`[wesu] native-audio ${file} patched`);
  }
} catch (e) {
  console.warn("[wesu] native-audio patch skipped:", e?.message ?? e);
}
