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
import { readFileSync, existsSync, readdirSync } from "node:fs";

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

// --- 6. route loaders must not override the snapshot fallback
//
// Each of these routes reads its data through useOfflineList, which renders the
// last snapshot when a query fails offline. A loader that throws sits one level
// ABOVE that fallback and replaces it with an error screen — so the offline
// path existed and was never reached.
const LOADER_ROUTES = {
  "src/routes/browse.tsx": "loaderGracefulAll",
  "src/routes/albums.index.tsx": "loaderGraceful",
  "src/routes/artists.index.tsx": "loaderGraceful",
  "src/routes/albums.$id.tsx": "isOfflineTransportFailure",
};

for (const [file, helper] of Object.entries(LOADER_ROUTES)) {
  if (!existsSync(file)) {
    problems.push(`${file} is missing — cannot check its loader`);
    continue;
  }
  const src = readFileSync(file, "utf8");
  // Match a CALL, not a mention.
  //
  // Checking `src.includes(helper)` also matches the import statement, so
  // removing every call site while leaving the import passed the gate. Verified
  // negatively on /browse, which is why this is written the long way.
  const called = new RegExp(`[^\\w.]${helper}\\s*\\(`).test(src);
  if (!called) {
    problems.push(
      `${file} never CALLS ${helper}, so its loader throws offline and replaces\n` +
        `        the snapshot fallback with an error screen`,
    );
  }
}

// --- 7. the album case specifically: a paid-for album must never be reported
// as missing just because the listener lost signal.
const albumRoute = "src/routes/albums.$id.tsx";
if (existsSync(albumRoute)) {
  const src = readFileSync(albumRoute, "utf8");
  // useSuspenseQuery has no offline branch at all: it rejects into the route
  // error boundary. The snapshot layer is the only offline-capable read.
  //
  // Strip comments first. An earlier version of this check matched the string
  // "useSuspenseQuery" ANYWHERE, including in the explanatory comment that
  // documents why it is not used — so the negative test passed while the file
  // was fully reverted. Verified negatively, which is how it was found.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  if (/useSuspenseQuery/.test(code)) {
    problems.push(
      `${albumRoute} uses useSuspenseQuery — suspense has no offline fallback, so the\n` +
        `        page errors out instead of rendering the cached album`,
    );
  }
  // The notFound() must be inside the try, AFTER the transport check, so a real
  // missing record still says so.
  if (!/isRedirect\(err\)/.test(src)) {
    problems.push(
      `${albumRoute} does not guard isRedirect — a genuine notFound would be\n` +
        `        misread as offline and shown as "can't show this album"`,
    );
  }
}

// --- 8. and the message must never claim a purchase vanished
if (existsSync(albumRoute)) {
  const src = readFileSync(albumRoute, "utf8");
  if (
    /Nothing (?:has been )?(?:been )?(?:lost|removed) from your (?:account|purchase)/i.test(src)
  ) {
    // good — reassures the listener their purchase is intact
  } else {
    problems.push(
      `${albumRoute} does not reassure the listener that their purchase is intact\n` +
        `        when the album cannot be shown offline`,
    );
  }
}

/**
 * Error text rendered into the page rather than shown in a toast.
 *
 * A toast is transient and dismissible, so a raw message there is acceptable —
 * mostly it reaches an artist or admin who can act on it. Text that persists in
 * JSX is not: it shows a listener server internals like "Unauthorized: Invalid
 * token" and says nothing about what to do.
 *
 * Line-based on purpose. Three regex attempts failed here and each failure was a
 * false alarm, which is worse than no check at all:
 *
 *   1. `[^}]*` matched newlines, pairing a `{` in one function with an
 *      `error.message` three functions later — 8 false positives.
 *   2. A 400-char bounded toast strip swallowed the JSX after each toast —
 *      4 false NEGATIVES, the worst kind.
 *   3. `[^/]*` in the line anchor also matched newlines — 3 false positives.
 *
 * A single-line scan cannot span functions. Lines containing `toast.` are skipped.
 */
function renderedErrorLines(src) {
  const hits = [];
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (line.includes("toast.")) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (inCallContext(lines, i)) return;
    if (feedsToastOnly(lines, i)) return;
    if (
      line.includes("(error as Error)?.message") ||
      line.includes("(error as Error).message") ||
      /\{\s*error\.message\s*\}/.test(line)
    ) {
      hits.push(i + 1);
    }
  });
  return hits;
}

/**
 * Lines that are part of a `console.*(...)` or `toast.*(...)` call.
 *
 * Looked at across lines because both are routinely written multi-line. A
 * per-line check reported a console.error's object body — `errorMessage:
 * (error as Error).message` on the line after the opening brace — as a
 * listener-facing leak.
 */
function inCallContext(lines, index) {
  for (let i = index; i >= Math.max(0, index - 12); i--) {
    const l = lines[i];
    if (
      /\b(console\.(?:error|warn|log|debug|info)|toast\.(?:error|success|info|warning))\s*\(/.test(
        l,
      )
    ) {
      const depth = (l.match(/\(/g) || []).length - (l.match(/\)/g) || []).length;
      if (depth > 0) return true;
      continue;
    }
    // A statement boundary closes any open call.
    if (/;\s*$/.test(l) && !/\($/.test(l.trim())) return false;
  }
  return false;
}

/**
 * True when the message is assigned to a variable that only a toast consumes.
 *
 *   const errorMsg = (error as Error).message;      // line 156
 *   toast.error(`Failed to update profile: ${errorMsg}`);   // line 157
 *
 * That is a toast, not a leak — the same category the line scan above already
 * allows. It is separated by a line, so inCallContext cannot see it and the
 * naive check reported it. Treated as acceptable only when the NEXT toast call
 * actually interpolates the variable; an unused assignment would be a real
 * problem and is left visible.
 */
function feedsToastOnly(lines, index) {
  const next = lines.slice(index + 1, index + 6).join("\n");
  if (!/\btoast\.(error|success|info|warning)\s*\(/.test(next)) return false;
  // The name being assigned on this line must appear inside that toast call.
  const m = /const\s+(\w+)\s*=\s*\(error as Error\)\??\.message/.exec(lines[index]);
  if (!m) return false;
  const toastBlock = next.slice(next.search(/\btoast\./));
  return toastBlock.includes(m[1]);
}

// --- 9. EVERY route's error surface must handle offline.
//
// Six detail routes read through useSuspenseQuery, which has no offline branch:
// the fetch rejects and the error surface renders. Nine more wrote their own
// inline screen. All showed a red "Something went wrong" for what is simply no
// connection, and eight leaked raw `(error as Error).message` — server internals
// like "Unauthorized: Invalid token" — to the listener.
//
// So the rule is: no route may define its own error surface. They delegate, and
// the offline branch lives in the shared one. A new route that forgets gets
// caught here rather than by a listener on a train.
const ROUTE_DIR = "src/routes";
const ownError = [];
const rawLeaks = [];
if (existsSync(ROUTE_DIR)) {
  const routeFiles = readdirSync(ROUTE_DIR).filter((f) => f.endsWith(".tsx"));
  for (const name of routeFiles) {
    if (name === "__root.tsx") continue; // checked separately above
    const src = readFileSync(`${ROUTE_DIR}/${name}`, "utf8");
    if (/errorComponent:\s*\(\{[^}]*\}\)\s*=>\s*(<|\()/.test(src)) {
      ownError.push(name);
    }
    // Raw error text RENDERED into the page.
    //
    // A toast is fine: transient, dismissed, and mostly aimed at an artist who
    // can act on it. Text that persists on screen is not — it shows a listener
    // server internals like "Unauthorized: Invalid token" or raw PostgREST JSON,
    // and says nothing about what to do next.
    //
    // So toast.error(...) is explicitly allowed and only JSX is flagged. This is
    // why the first version of this check produced seven false alarms: it
    // matched toasts, which are not a leak.
    const isAdmin = name.startsWith("superadmin") || name.startsWith("admin");
    if (!isAdmin && renderedErrorLines(src).length) {
      rawLeaks.push(`${name} (line ${renderedErrorLines(src)[0]})`);
    }
  }
  notes.push(`${routeFiles.length} routes checked for an offline-capable error surface`);
}
if (ownError.length) {
  problems.push(
    `these routes define their own error surface, so the offline branch never runs:\n` +
      `        ${ownError.join("\n        ")}`,
  );
}
if (rawLeaks.length) {
  problems.push(
    `these routes render raw error text to the listener:\n        ${rawLeaks.join("\n        ")}`,
  );
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
