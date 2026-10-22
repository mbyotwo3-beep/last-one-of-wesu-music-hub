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

// --- 2. the homepage must NOT advertise the sideload APK
//
// Decision: everyone installs from Google Play. The sideload link exists only
// for us to share directly with a tester, so it must stay reachable as a URL
// while never being advertised.
//
// The earlier version of this check REQUIRED a UI link, and would have fought
// this decision. It was right at the time — nothing linked to the APK and
// listeners genuinely could not find it. Now the requirement is inverted: the
// link must still work, and must not be pushed at anyone.
const APK_URL_RE = /["'`]\/wesuplus\.apk["'`]/;

const HOMEPAGE = "src/routes/index.tsx";
if (existsSync(HOMEPAGE)) {
  const home = readFileSync(HOMEPAGE, "utf8");
  if (APK_URL_RE.test(home) || /GetTheApp/.test(home)) {
    problems.push(
      "the homepage advertises the sideload APK.\n" +
        "        Everyone installs from Google Play; the APK link is only for us to\n" +
        "        share directly. Remove <GetTheApp /> and the /wesuplus.apk URL\n" +
        "        from src/routes/index.tsx.",
    );
  } else {
    notes.push("homepage does not advertise the sideload — Play Store only");
  }
} else {
  problems.push("src/routes/index.tsx is missing");
}

// --- 3. the install panel and the APK link still have a deliberate home
//
// GetTheApp is the PWA-prompt / iOS-help panel (it captures beforeinstallprompt
// so Chrome's own mini-infobar does not compete with ours). It lives on /get-app,
// the page people visit on purpose asking for the app, next to the APK buttons.
// /downloads must NOT carry it: that page used to be a stack of promos and
// diagnostics above the listener's actual music, and it is now a plain list —
// someone arriving from a player notice wants their songs, not install options.
if (!existsSync("src/components/GetTheApp.tsx")) {
  problems.push("src/components/GetTheApp.tsx is missing — /get-app has no install panel");
} else {
  const src = readFileSync("src/components/GetTheApp.tsx", "utf8");
  const getAppPage = "src/routes/get-app.tsx";
  if (!existsSync(getAppPage)) {
    problems.push("src/routes/get-app.tsx is missing — the install panel has no page");
  } else if (!readFileSync(getAppPage, "utf8").includes("<GetTheApp")) {
    problems.push("GetTheApp exists but is not rendered on /get-app");
  }
  const dl = "src/routes/downloads.tsx";
  if (existsSync(dl) && /<GetTheApp/.test(readFileSync(dl, "utf8"))) {
    problems.push(
      "GetTheApp is rendered on /downloads again — the offline list must stay a\n" +
        "        plain list; the install panel belongs on /get-app",
    );
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

// --- 6. the native side must actually let offline work
//
// Two native bugs made offline impossible no matter what the web layer did, and
// neither is visible from JavaScript:
//
//   Capacitor's WebViewLocalServer answers every request to the configured
//   server.url itself, BEFORE the WebView's service-worker machinery is
//   consulted. A worker could register, report that it controlled the page, and
//   still never serve a single navigation. Configuring ServiceWorkerController
//   did not help, because the request never got far enough to reach it. This
//   version of the app answers documents from OfflineShell instead.
//
//   Android 11 defaults setAllowFileAccess to FALSE, so loading the offline page
//   from file:///android_asset/ is refused — the error handler fired and then its
//   OWN page was blocked, showing Android's raw "Webpage not available".
//
// The second also explains why two different screenshots exist for one failure:
// it was never flaky, it depends on the Android version.
const ACTIVITY = "android/app/src/main/java/com/wesu/music/MainActivity.java";
const SHELL = "android/app/src/main/java/com/wesu/music/OfflineShell.java";
if (!existsSync(ACTIVITY)) {
  problems.push(`${ACTIVITY} is missing`);
} else {
  // Comments are stripped first. This file explains both bugs in prose, and the
  // words "ServiceWorkerController" and "loadDataWithBaseURL" appear there — so a
  // naive search matched the explanation rather than the code, and both negative
  // tests passed with the fix removed. Same trap as the album-route check.
  //
  // This gate previously REQUIRED ServiceWorkerController to be present. That
  // requirement encoded the bug: it failed the build on the correct code and
  // would have passed on code that cannot serve a page at all. A gate must
  // assert a mechanism that works, not one that merely looks like a fix.
  const javaCode = readFileSync(ACTIVITY, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  if (!/OfflineShell\s*\.\s*resolve/.test(javaCode)) {
    problems.push(
      "MainActivity does not resolve requests through OfflineShell. Capacitor's\n" +
        "        proxy answers the navigation itself and the service worker is never\n" +
        "        consulted, so without this the app cannot open while offline.",
    );
  }
  // The live site must still win when there IS a connection: the app is a shell
  // around wesuplus.com, so a cache-first app would freeze on install-day HTML
  // and no web fix would ever reach an installed listener.
  const offlineShellSrc = existsSync(SHELL)
    ? readFileSync(SHELL, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    : "";
  if (/OfflineShell\s*\.\s*resolve/.test(javaCode) && offlineShellSrc) {
    const docStart = offlineShellSrc.indexOf("WebResourceResponse serveDocument(");
    const docBody =
      docStart === -1 ? "" : offlineShellSrc.slice(docStart, docStart + 900);
    const fetchAt = docBody.indexOf("fetch(url, requestHeaders)");
    const cacheAt = docBody.indexOf("serveCachedDocument(ctx, url)");
    if (fetchAt !== -1 && cacheAt !== -1 && fetchAt > cacheAt) {
      problems.push(
        "OfflineShell consults the cache before the network — the app would show a\n" +
          "          stale shell while online and no web fix would reach installed users",
      );
    }
  }
  // The offline page must be DATA, not file://.
  if (/loadUrl\(\s*ERROR_PAGE\s*\)/.test(javaCode) && !/loadDataWithBaseURL/.test(javaCode)) {
    problems.push(
      "MainActivity loads the offline page from file:// without a data-URL path.\n" +
        "        Android 11 disabled file access by default, so on a modern phone the\n" +
        "        handler's own page is blocked and the listener sees Android's raw\n" +
        "        error screen with a visible URL.",
    );
  }
  // SSL errors must still fail closed. Play policy rejects apps that bypass them,
  // and a music app that silently accepts a bad certificate is a licence leak.
  if (!/onReceivedSslError/.test(javaCode) || !/handler\.cancel\(\)/.test(javaCode)) {
    problems.push("MainActivity must cancel on SSL errors — never bypass a certificate error");
  }
}

// --- 7. the honesty check: the copy must not claim downloads are app-only
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
