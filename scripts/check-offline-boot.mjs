/**
 * The app must be able to BOOT with the network off.
 *
 * WHAT BROKE, and why it is worth a gate
 *
 * The app is a WebView around an SSR site. There is no static index.html
 * anywhere in the project, because every page is rendered by the server on
 * request. So with the data off, the WebView cannot fetch a document at all.
 *
 * A tester reported the consequence: the app showed Android's "Webpage not
 * available" screen and none of the offline features could be seen. Every one of
 * them — the encrypted vault, the offline-mode switch, the list snapshots —
 * lives inside the React tree that never starts. Nothing was broken; the thing
 * that would have rendered it could not boot.
 *
 * That is invisible to every other check here. The vault is well tested, the
 * offline mode is well tested, the app URL is correct, the APK is signed — and
 * all of it is unreachable when it matters most. Tests on the parts cannot catch
 * a failure to load the whole.
 *
 * So this asserts the property that was actually missing: a shell exists on the
 * device, and a worker is registered to serve it.
 *
 * Usage: node scripts/check-offline-boot.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const problems = [];
const notes = [];

const SW = "public/sw.js";
const REGISTER = "src/lib/offline-shell.ts";
const ROOT = "src/routes/__root.tsx";

// --- 1. there is no static HTML, so a cache is the ONLY way to boot offline
const hasStaticShell = ["index.html", "dist/client/index.html", ".output/public/index.html"].some(
  (p) => existsSync(p),
);
if (!hasStaticShell && !existsSync(SW)) {
  problems.push(
    "the app is SSR (no static index.html) and there is no shell cache, so it\n" +
      "        cannot start with the data off. Every offline feature is unreachable.",
  );
}

// --- 2. the worker must exist and cover the whole app
if (existsSync(SW)) {
  const sw = readFileSync(SW, "utf8");
  notes.push(`shell cache ${(sw.length / 1024).toFixed(1)} KB`);

  if (!/self\.addEventListener\("fetch"/.test(sw)) {
    problems.push("sw.js has no fetch handler — it would never serve anything");
  }
  if (!/request\.mode === "navigate"/.test(sw)) {
    problems.push("sw.js does not handle navigations — offline page loads would still fail");
  }
  if (!/caches\.open\(SHELL_CACHE\)/.test(sw)) {
    problems.push("sw.js never opens the shell cache");
  }

  // Network-first is what keeps web fixes reaching installed apps with no
  // rebuild. Cache-first would freeze every listener on their first build.
  const navIdx = sw.indexOf('request.mode === "navigate"');
  if (navIdx > -1) {
    const nav = sw.slice(navIdx, navIdx + 900);
    const netAt = nav.indexOf("await fetch(request)");
    const cacheAt = nav.indexOf("caches.open(SHELL_CACHE)");
    if (netAt > -1 && cacheAt > -1 && cacheAt < netAt) {
      problems.push(
        "sw.js consults the cache BEFORE the network on navigation — that would freeze the app",
      );
    }
  }

  // Money and audio must never come from a cache.
  const never = sw.slice(sw.indexOf("NEVER_CACHE"), sw.indexOf("function shouldNeverCache"));
  for (const [label, re] of [
    ["the API", /api/],
    ["Supabase", /supabase/i],
    ["Lenco", /lenco/i],
    ["audio files", /mp3|m4a|aac|ogg|wav|opus/i],
  ]) {
    if (!re.test(never)) problems.push(`sw.js does not exclude ${label} from the cache`);
  }
  if (!/if \(shouldNeverCache\(url\)\) return;/.test(sw)) {
    problems.push("sw.js does not bail out early for never-cached requests");
  }
}

// --- 3. it must actually be registered, at root scope, on native only
if (existsSync(REGISTER)) {
  const reg = readFileSync(REGISTER, "utf8");
  if (!/register\("\/sw\.js", \{ scope: "\/" \}\)/.test(reg)) {
    problems.push(
      "offline-shell.ts does not register /sw.js at the root scope — it would not\n" +
        "        control any route except /",
    );
  }
  // A registration failure must never stop the app booting.
  if (!/catch/.test(reg)) {
    problems.push("offline-shell.ts has no catch around registration — a failure could break boot");
  }
} else {
  problems.push("src/lib/offline-shell.ts is missing — nothing registers the worker");
}

// --- 4. and the app must call it
if (existsSync(ROOT)) {
  const root = readFileSync(ROOT, "utf8");
  if (!/ensureShellCache\(\)/.test(root)) {
    problems.push(
      "__root.tsx never calls ensureShellCache() — the worker would never be installed",
    );
  }
  // Deferred to window.load so it never competes with first paint on the cheap
  // phones this audience uses.
  if (!/addEventListener\("load"/.test(root)) {
    problems.push(
      "__root.tsx registers the worker without waiting for load — it competes with\n" +
        "        first paint on the low-end devices that need this most",
    );
  }
}

// --- 5. an unsupported vault must be visible, not silent
if (existsSync("src/components/DownloadsSection.tsx")) {
  const dl = readFileSync("src/components/DownloadsSection.tsx", "utf8");
  // Any `return null` whose condition mentions isVaultSupported — braced or not,
  // in either order, comments and blank lines tolerated.
  //
  // Two earlier versions of this pattern both FAILED their own negative test:
  // one matched a single exact line, the next required a brace the real code
  // does not use. So reverting to the silent guard passed the gate. That is the
  // whole point of verifying a gate negatively — a gate that cannot be shown to
  // fail is not known to work.
  const silentNull =
    /if \([^)]*isVaultSupported\(\)[^)]*\)[^{;]*\{\s*(?:\/\/[^\n]*\n\s*)*return null;/;
  const silentInline = /if \([^)]*isVaultSupported\(\)[^)]*\)\s*return null;/;
  if (silentNull.test(dl) || silentInline.test(dl)) {
    problems.push(
      "DownloadsSection returns null when the vault is unsupported, so a phone that\n" +
        "        cannot store downloads shows an empty page identical to having none",
    );
  }
}

console.log("  the app can start with the data off");
for (const n of notes) console.log(`    ${n}`);

if (problems.length) {
  console.error("");
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error("\n  offline would be a dead end");
  process.exit(1);
}
console.log("  SSR app, so a cached shell is the only way offline works — and it is wired");
