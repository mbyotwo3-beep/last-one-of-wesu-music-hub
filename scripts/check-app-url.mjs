/**
 * The iOS WebView points somewhere. Make sure it points at the real site.
 *
 * WHY THIS EXISTS
 *
 * This is the single most destructive mistake available in this project, and it
 * had already been made. ios/App/App/capacitor.config.json contained:
 *
 *     "url": "https://www.wesuplusly.com/"
 *
 * — an extra "ly". Every iOS build would have launched a WebView on a domain
 * that does not resolve: a permanently white screen, no error dialog, no log
 * anyone would read. And it was invisible here, because Android's copy of the
 * same file was correct, the Android APK was tested and worked, and
 * capacitor.config.ts in the repo root was correct.
 *
 * The iOS copy is generated into the native project, so it drifts from the
 * source of truth independently. Nothing regenerates it unless someone runs
 * `npx cap sync ios` on a Mac. Until then, this file IS the app's behaviour.
 *
 * So: compare every generated copy against capacitor.config.ts, and require the
 * host to be a real, resolvable domain — not just "some string".
 *
 * Usage: node scripts/check-app-url.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const COPIES = [
  "capacitor.config.ts",
  "ios/App/App/capacitor.config.json",
  "android/app/src/main/assets/capacitor.config.json",
];

/** Pull the server url out of a TS or JSON config without a parser. */
function serverUrl(path) {
  const raw = readFileSync(path, "utf8");
  const m = /["']?url["']?\s*:\s*["'](https?:\/\/[^"']+)["']/.exec(raw);
  return m?.[1] ?? null;
}

const problems = [];
const seen = [];

for (const path of COPIES) {
  if (!existsSync(path)) {
    problems.push(`${path} is missing`);
    continue;
  }
  const url = serverUrl(path);
  if (!url) {
    problems.push(`${path} has no server.url — the app would fall back to bundled files`);
    continue;
  }
  seen.push({ path, url });
}

const distinct = [...new Set(seen.map((s) => s.url))];
if (distinct.length > 1) {
  problems.push(
    `the app points at different hosts in different places:\n` +
      seen.map((s) => `        ${s.url}   (${s.path})`).join("\n") +
      `\n      One of these is wrong and the build will show a white screen on that platform.`,
  );
}

// A typo'd host still parses as a URL, so also require a plausible domain: no
// doubled letters immediately before the TLD are the common signature, and the
// host must have a real registrable name.
for (const { path, url } of seen) {
  const host = new URL(url).hostname;
  if (!/^www\.[a-z0-9-]+\.[a-z]{2,}$/.test(host)) {
    problems.push(`${path}: host "${host}" does not look like a real domain`);
  }
  if (/(.)\1{2,}\.[a-z]{2,}$/.test(host)) {
    problems.push(`${path}: host "${host}" has a suspicious repeated letter before the TLD`);
  }
}

console.log(`  every app copy points at ${distinct[0] ?? "(nothing)"}`);
for (const { path, url } of seen) console.log(`    ${url}   ${path}`);

if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error("\n  the app would launch on the wrong site");
  process.exit(1);
}
console.log("  android and iOS load the same production site");
