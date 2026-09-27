// Reapplies the Wesu lock-screen skip patch to @capgo/native-audio after
// fresh installs (node_modules isn't committed). Idempotent: skips when the
// marker is already present. Safe no-op when the package is absent (e.g. a
// web-only environment).
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(
  root,
  "node_modules/@capgo/native-audio/android/src/main/java/ee/forgr/audio/NativeAudio.java",
);
const source = join(root, "android/patches/capgo-native-audio-7.11.2/NativeAudio.java");
const MARKER = "WESU PATCH";

try {
  if (!existsSync(target) || !existsSync(source)) process.exit(0);
  const current = readFileSync(target, "utf8");
  if (current.includes(MARKER)) {
    console.log("[wesu] native-audio skip patch already applied");
    process.exit(0);
  }
  copyFileSync(source, target);
  console.log("[wesu] native-audio skip patch applied");
} catch (e) {
  console.warn("[wesu] skip patch skipped:", e?.message ?? e);
}
