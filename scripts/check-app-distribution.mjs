/**
 * Is the app actually reachable by a listener who wants it?
 *
 * WHY THIS EXISTS
 *
 * The APK had been built, signed and hosted at /wesuplus.apk for a long time.
 * NOTHING ON THE SITE LINKED TO IT. Listeners kept asking for a mobile app and
 * the answer was always a support conversation, because there was no way for
 * them to find it themselves.
 *
 * A binary sitting on a server is not a distribution channel. This asserts the
 * part a listener actually touches.
 *
 * Usage: node scripts/check-app-distribution.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const problems = [];
const notes = [];

// --- 1. the APK must be committed and deployed
const published = "public/wesuplus.apk";
if (!existsSync(published)) {
  problems.push(
    "public/wesuplus.apk is missing — the APK cannot be downloaded by anyone\n" +
      "        The binary existing on a server is not distribution.",
  );
} else {
  notes.push(`APK ${(readFileSync(published).length / 1048576).toFixed(1)} MB at /wesuplus.apk`);
}

// --- 2. something on the site must LINK to it
//
// The actual defect. Searching for the string is not enough: a comment or a
// dead branch would satisfy it. This looks for the download inside rendered JSX.
const LINKING = [
  "src/components/GetTheApp.tsx",
  "src/routes/downloads.tsx",
  "src/routes/index.tsx",
];
let linked = [];
for (const file of LINKING) {
  if (!existsSync(file)) continue;
  const src = readFileSync(file, "utf8");
  if (/["'`]\/wesuplus\.apk["'`]/.test(src)) linked.push(file);
}
if (!linked.length) {
  problems.push(
    "nothing in the UI links to /wesuplus.apk — listeners asking for the app cannot\n" +
      "        find it. This is the defect that kept the app 'unavailable' while it\n" +
      "        was fully built and hosted.",
  );
} else {
  notes.push(`linked from ${linked.length} surface(s): ${linked.join(", ")}`);
}

// --- 3. the GetTheApp panel must exist and be used
if (!existsSync("src/components/GetTheApp.tsx")) {
  problems.push("src/components/GetTheApp.tsx is missing — there is no install affordance");
} else {
  const src = readFileSync("src/components/GetTheApp.tsx", "utf8");
  const used = LINKING.slice(1).some(
    (f) => existsSync(f) && readFileSync(f, "utf8").includes("<GetTheApp"),
  );
  if (!used) {
    problems.push("GetTheApp exists but is not rendered anywhere");
  }
  // beforeinstallprompt must be preventDefault()ed, or Chrome also shows its own
  // mini-infobar and the listener gets two competing prompts.
  if (!/preventDefault/.test(src)) {
    problems.push(
      "GetTheApp does not preventDefault() the beforeinstallprompt event — Chrome\n" +
        "        will show its own prompt alongside ours",
    );
  }
}

// --- 4. the web manifest must be installable, since that is how iPhone and
//        desktop get the app without a store
const manifest = "public/manifest.webmanifest";
if (!existsSync(manifest)) {
  problems.push("public/manifest.webmanifest is missing — nothing can be installed from the web");
} else {
  const m = JSON.parse(readFileSync(manifest, "utf8"));
  if (m.display !== "standalone") {
    problems.push(
      `manifest display is "${m.display}"; "standalone" is what makes it open like an app`,
    );
  }
  const hasMaskable = (m.icons ?? []).some((i) => String(i.purpose ?? "").includes("maskable"));
  if (!hasMaskable) {
    problems.push("manifest has no maskable icon — Android will letterbox the installed icon");
  }
  const sizes = (m.icons ?? []).map((i) => i.sizes);
  if (!sizes.some((s) => s?.includes("512"))) {
    problems.push("manifest has no 512x512 icon — required for a home-screen install");
  }
  notes.push(`manifest: standalone, ${(m.icons ?? []).length} icons`);
}

// --- 5. iOS ignores the web manifest, so it needs its own meta tags
const root = "src/routes/__root.tsx";
if (existsSync(root)) {
  const src = readFileSync(root, "utf8");
  if (!/apple-mobile-web-app-capable/.test(src)) {
    problems.push(
      "__root.tsx has no apple-mobile-web-app-capable — on an iPhone, Add to Home\n" +
        "        Screen opens a browser-looking window instead of fullscreen",
    );
  }
  if (!/rel:\s*"manifest"/.test(src)) {
    problems.push("__root.tsx does not link the manifest — nothing can install from the web");
  }
} else {
  problems.push("src/routes/__root.tsx is missing");
}

// --- 6. the honesty check: the copy must not claim downloads are app-only
//
// Listeners were asking on the belief that downloads only work inside an app.
// They do not — the vault is IndexedDB, which a desktop browser has too. Copy
// that repeats the belief sends them looking for something that does not exist.
if (existsSync("src/components/GetTheApp.tsx")) {
  const src = readFileSync("src/components/GetTheApp.tsx", "utf8");
  if (/only (work|available)[^.\n]{0,30}(app|mobile)/i.test(src)) {
    problems.push(
      "GetTheApp copy claims downloads only work in the app — they work in any\n" +
        "        browser, and saying otherwise sends people hunting for a limitation",
    );
  }
  if (!/downloads keep working here in the browser/i.test(src)) {
    problems.push(
      "GetTheApp does not tell a listener their existing browser downloads keep\n" +
        "        working — which is the question they are actually asking",
    );
  }
}

console.log("  listeners can find and install the app");
for (const n of notes) console.log(`    ${n}`);

if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error("\n  the app exists but cannot be found");
  process.exit(1);
}
console.log("  Android gets the APK, iPhone and desktop get an install prompt");
