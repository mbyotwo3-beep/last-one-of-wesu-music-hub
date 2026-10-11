/**
 * Does the Android offline shell actually work?
 *
 * WHY THIS GATE EXISTS
 *
 * A tester reported the app showing the branded offline error page. The cause
 * was not a missing service worker — public/sw.js was deployed, registered and
 * claiming to control the page. The cause was that Capacitor answers every
 * request itself, so the worker was never consulted for a single navigation.
 *
 * That was found by reading Capacitor's source, not by testing. This gate exists
 * so the same class of bug cannot be reintroduced silently, and so the
 * classification that decides WHAT may be served from cache is proved by running
 * the real Java rather than by grepping for a method name.
 *
 * THE CLASSIFICATION IS EXECUTED, NOT PARsed
 *
 * isVolatile / isImmutableAsset / isDocument / cacheName / mimeFor decide whether
 * a purchase result or a signed audio URL could ever be replayed from a cache.
 * Getting that wrong is a money bug and a dead-stream bug, so this compiles
 * OfflineShell.java against android.jar and calls the real private methods over
 * reflection. A copy of the logic in the gate would prove nothing about the
 * code that ships.
 *
 * The Android methods are stubs that throw if called, which is exactly why the
 * probe only touches the pure string helpers and never the Context paths.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SRC = "android/app/src/main/java/com/wesu/music/OfflineShell.java";
const MAIN = "android/app/src/main/java/com/wesu/music/MainActivity.java";

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);

// ---------------------------------------------------------------- 1. wiring

const main = readFileSync(MAIN, "utf8");

// The resolver must be REACHED from shouldInterceptRequest. Defining
// OfflineShell and never calling it is the exact shape of the bug it replaced.
if (!/shouldInterceptRequest[\s\S]{0,600}OfflineShell\.resolve\(/.test(main)) {
  fail(
    "MainActivity's shouldInterceptRequest does not call OfflineShell.resolve —\n" +
      "        the offline shell would be dead code, which is what the service\n" +
      "        worker became in vc33",
  );
} else {
  notes.push("the WebViewClient resolves documents through OfflineShell");
}

// ...and the result must actually be returned, not discarded.
if (!/android\.webkit\.WebResourceResponse resolved = OfflineShell\.resolve\([\s\S]{0,200}if \(resolved != null\) return resolved;/.test(main)) {
  fail(
    "MainActivity computes an OfflineShell response but does not return it, so\n" +
      "        Capacitor's proxy still answers and the cache is never consulted",
  );
} else {
  notes.push("the resolved response is returned to the WebView");
}

// Host matching must be exact. endsWith("wesuplus.com") also accepts
// "evil-wesuplus.com", which would let a lookalike host be answered from the
// app's cache.
if (!/"www\.wesuplus\.com"\.equals\(host\)/.test(main)) {
  fail(
    'the host check is not an exact match — "evil-wesuplus.com" would be\n' +
      '        answered from the app cache if it uses endsWith',
  );
} else {
  notes.push("only www.wesuplus.com is answered locally, matched exactly");
}

// The AppContextHolder must be set before the client is installed, or the very
// first request finds a null context and falls through to a failed network load.
const setAt = main.indexOf("OfflineShell.AppContextHolder.set(");
const installAt = main.indexOf("setWebViewClient(new WesuWebViewClient(bridge))");
if (setAt === -1 || installAt === -1 || setAt > installAt) {
  fail(
    "the application context is not set before the WebViewClient is installed —\n" +
      "        the first request of a cold start would find a null context",
  );
} else {
  notes.push("the offline context is ready before the first request");
}

// The service worker is inert in the WebView. Leaving the call in place would
// keep implying it does the work.
if (/enableServiceWorkerInterception\(\)\s*;/.test(main.replace(/\/\*[\s\S]*?\*\//g, ""))) {
  fail(
    "the native ServiceWorkerController call is still live — it can never serve a\n" +
      "        navigation here, so it only re-creates the false belief that it does",
  );
} else {
  notes.push("the inert ServiceWorkerController call is gone, and the reason is written down");
}

// public/sw.js must survive: it IS the mechanism in a desktop browser.
if (!existsSync("public/sw.js")) {
  fail("public/sw.js is missing — offline in a desktop browser depends on it");
} else {
  notes.push("public/sw.js remains for browsers, where it does work");
}

// --- the fallback page must not contradict what the app can now do
//
// This page only renders when there is no network AND no saved copy, so it is
// the first-run-offline case. It used to say "reconnect to open Wesu+ and enjoy
// them", which was true when the only offline story was "your downloads keep
// playing" and became false the moment the shell itself could be served from
// disk. Copy that overstates a limitation sends people hunting for one that is
// no longer there.
const ERROR_HTML = "android/app/src/main/assets/error.html";
if (!existsSync(ERROR_HTML)) {
  fail(`${ERROR_HTML} is missing, so a failed load falls back to Android's raw error screen`);
} else {
  const html = readFileSync(ERROR_HTML, "utf8");
  if (/reconnect to open/i.test(html)) {
    fail(
      "the offline fallback page says 'reconnect to open' — the app now opens\n" +
        "        without a connection once it has been opened once, so this tells the\n" +
        "        listener to do something the app no longer needs",
    );
  } else if (!/first time only|first time/i.test(html)) {
    fail(
      "the offline fallback page does not say this is a first-run-only situation,\n" +
        "        so a listener with no connection is left with no idea what to do",
    );
  } else {
    notes.push("the fallback page explains this is a first-run-only problem");
  }
}

// ------------------------------------------------- 2. network-first ordering

const shell = readFileSync(SRC, "utf8");
const docStart = shell.indexOf("private static WebResourceResponse serveDocument(");
if (docStart === -1) {
  fail("serveDocument is missing from OfflineShell");
} else {
  const body = shell.slice(docStart, shell.indexOf("\n    }", docStart));
  const fetchAt = body.indexOf("fetch(url, requestHeaders)");
  const cacheAt = body.indexOf("serveCachedDocument(ctx, url)");
  if (fetchAt === -1 || cacheAt === -1) {
    fail("serveDocument no longer fetches and then falls back to the cache");
  } else if (fetchAt > cacheAt) {
    fail(
      "serveDocument tries the CACHE before the network — the app would show a\n" +
      "        stale shell while online, silently freezing installed apps on\n" +
      "        whatever they saw on install day",
    );
  } else {
    notes.push("documents are fetched live first, with the cache only as the fallback");
  }
}

// The cookie header must be forwarded, or SSR renders the anonymous shell while
// the client boots signed in and hydration tears the page down.
//
// Scoped to the body of fetch(). The previous version was
//   /requestHeaders[\s\S]{0,900}Cookie|"cookie"/i
// whose top-level `|` makes it `(...Cookie) OR ("cookie")` — so the second
// branch matched the word "cookie" in the explanatory comment and the whole
// check could never fire. Seventh time a check was weaker than it looked, and
// again the gate was the defect, not the code.
const fetchStart = shell.indexOf("private static byte[] fetch(");
const fetchBody =
  fetchStart === -1 ? "" : shell.slice(fetchStart, shell.indexOf("\n    }", fetchStart));
// The headers must be forwarded BY VARIABLE. Checking merely for
// conn.setRequestProperty( passes even when the call is hardcoded to a literal
// and the request's own Cookie header is thrown away — which is the exact
// failure a mutation proved, so the assertion is on the variable form.
if (
  !/requestHeaders\.entrySet\(\)/.test(fetchBody) ||
  !/conn\.setRequestProperty\(key, val\)/.test(fetchBody)
) {
  fail(
    "the network fetch does not forward the request's own headers — the server\n" +
      "        would render an anonymous shell for a signed-in listener and\n" +
      "        hydration would fail",
  );
} else {
  notes.push("cookies are forwarded, so SSR matches the signed-in client");
}

// ----------------------------------------- 3. run the real classification

function findAndroidJar() {
  const root = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const dirs = [];
  if (root) dirs.push(join(root, "platforms"));
  dirs.push(join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platforms"));
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    const found = readdirSync(d)
      .filter((v) => /^android-\d+$/.test(v))
      .sort()
      .reverse()
      .map((v) => join(d, v, "android.jar"))
      .find((p) => existsSync(p));
    if (found) return found;
  }
  return null;
}

const jar = findAndroidJar();
const jdk =
  process.env.JAVA_HOME ||
  "C:\\Program Files\\Android\\Android Studio\\jbr";

if (!jar || !existsSync(join(jdk, "bin", "java.exe"))) {
  fail(
    "could not run the classification probe (no android.jar or no JDK), so the\n" +
      "        rules that decide what may be served from cache are unproven",
  );
} else {
  const work = mkdtempSync(join(tmpdir(), "offline-shell-"));
  const probe = join(work, "ShellProbe.java");
  const pkgDir = join(work, "com", "wesu", "music");
  mkdirSync(pkgDir, { recursive: true });

  writeFileSync(
    probe,
    `
package com.wesu.music;

import java.lang.reflect.Method;

/**
 * Calls OfflineShell's private, pure classification helpers by reflection.
 *
 * Reflection is used so this probe needs no production code to be widened from
 * private to package-private for the sake of a test. It also means the probe
 * cannot accidentally change how the class behaves.
 */
public class ShellProbe {
    static Method m(String name, Class<?>... types) throws Exception {
        Method x = OfflineShell.class.getDeclaredMethod(name, types);
        x.setAccessible(true);
        return x;
    }

    public static void main(String[] args) throws Exception {
        String[] urls = {
            "https://www.wesuplus.com/",
            "https://www.wesuplus.com/library",
            "https://www.wesuplus.com/albums/abc-123",
            "https://www.wesuplus.com/downloads",
            "https://www.wesuplus.com/api/purchases",
            "https://www.wesuplus.com/_serverFn/x",
            "https://abcd.supabase.co/rest/v1/songs?select=*",
            "https://abcd.supabase.co/auth/v1/token",
            "https://abcd.supabase.co/storage/v1/object/public/art/a.jpg",
            "https://media.wesuplus.com/storage/v1/object/public/art/cover",
            "https://payments.lenco.co/api/v1/checkout",
            "https://payments.lenco.co/v1/checkout-session",
            "https://cdn.example.com/audio/track-1.mp3?signature=abc",
            "https://cdn.example.com/audio/track-2.m4a?sig=x",
            "https://www.wesuplus.com/assets/9f3a2b",
            "https://www.wesuplus.com/assets/client-9f3a2b.js",
            "https://www.wesuplus.com/assets/CarouselBuilder-B7TEAeeR.js",
            "https://www.wesuplus.com/favicon.ico",
            "https://www.wesuplus.com/manifest.webmanifest",
            "https://www.wesuplus.com/library?_routes=%2Fapi%2Fthing",
            "https://www.wesuplus.com/?_root",
        };
        Method volatileM = m("isVolatile", String.class);
        Method immutableM = m("isImmutableAsset", String.class);
        Method documentM = m("isDocument", String.class);
        Method cacheM = m("cacheName", String.class);
        Method mimeM = m("mimeFor", String.class);

        for (String u : urls) {
            System.out.println(String.join("\\t",
                u,
                String.valueOf(volatileM.invoke(null, u)),
                String.valueOf(immutableM.invoke(null, u)),
                String.valueOf(documentM.invoke(null, u)),
                String.valueOf(cacheM.invoke(null, u)),
                String.valueOf(mimeM.invoke(null, u))));
        }

        // "/a/b" and "/a_b" flatten to the same filename unless the collision is
        // handled, which would serve one screen's HTML for another.
        System.out.println("COLLISION\\t" +
            !cacheM.invoke(null, "https://www.wesuplus.com/a/b")
                .equals(cacheM.invoke(null, "https://www.wesuplus.com/a_b")));
        System.out.println("ROOT\\t" +
            cacheM.invoke(null, "https://www.wesuplus.com/"));
    }
}
`,
  );

  try {
    execFileSync(
      join(jdk, "bin", "javac.exe"),
      ["-nowarn", "-cp", jar, "-d", work, SRC, probe],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const out = execFileSync(join(jdk, "bin", "java.exe"), ["-cp", `${work};${jar}`, "com.wesu.music.ShellProbe"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const rows = out
      .split(/\r?\n/)
      .filter((l) => l.startsWith("http") || l.startsWith("COLLISION") || l.startsWith("ROOT"))
      .map((l) => {
        const [url, volatile_, immutable, document, cache, mime] = l.split("\t");
        return { url, volatile: volatile_ === "true", immutable, document, cache, mime };
      });

    const byUrl = new Map(rows.filter((r) => r.url.startsWith("http")).map((r) => [r.url, r]));

    const expect = [
      ["https://www.wesuplus.com/", { document: "true" }],
      ["https://www.wesuplus.com/library", { document: "true" }],
      ["https://www.wesuplus.com/albums/abc-123", { document: "true" }],
      ["https://www.wesuplus.com/downloads", { document: "true" }],
      ["https://www.wesuplus.com/api/purchases", { document: "false", volatile: true }],
      ["https://abcd.supabase.co/rest/v1/songs?select=*", { document: "false", volatile: true }],
      ["https://abcd.supabase.co/auth/v1/token", { document: "false", volatile: true }],
      ["https://abcd.supabase.co/storage/v1/object/public/art/a.jpg", { document: "false", volatile: true }],
      ["https://media.wesuplus.com/storage/v1/object/public/art/cover", { document: "false", volatile: true }],
      ["https://payments.lenco.co/api/v1/checkout", { document: "false", volatile: true }],
      ["https://payments.lenco.co/v1/checkout-session", { document: "false", volatile: true }],
      ["https://cdn.example.com/audio/track-1.mp3?signature=abc", { document: "false", volatile: true }],
      ["https://cdn.example.com/audio/track-2.m4a?sig=x", { document: "false", volatile: true }],
      ["https://www.wesuplus.com/assets/9f3a2b", { immutable: "true", document: "false" }],
      ["https://www.wesuplus.com/assets/client-9f3a2b.js", { immutable: "true", document: "false" }],
      ["https://www.wesuplus.com/favicon.ico", { immutable: "true", document: "false" }],
      ["https://www.wesuplus.com/manifest.webmanifest", { immutable: "true", document: "false" }],
      ["https://www.wesuplus.com/library?_routes=%2Fapi%2Fthing", { document: "false" }],
      ["https://www.wesuplus.com/?_root", { document: "false" }],
    ];

    for (const [url, want] of expect) {
      const row = byUrl.get(url);
      if (!row) {
        fail(`the probe produced no row for ${url}`);
        continue;
      }
      for (const [key, value] of Object.entries(want)) {
        if (row[key] !== value) {
          fail(
            `${url}\n        expected ${key}=${value}, got ${key}=${row[key]}` +
              (key === "document" && value === "false" && row.volatile
                ? "  (served from a cache that must never hold it)"
                : ""),
          );
        }
      }
    }

    // COLLISION and ROOT are label + value lines, not the six-column URL rows.
// Reading them through the same positional parser gave url="ROOT" and
// cache=undefined, and reported two failures against code that was correct.
const labelled = (label) => out.split(/\r?\n/).find((l) => l.startsWith(`${label}\t`))?.split("\t")[1];

if (labelled("COLLISION") !== "true") {
  fail(
    "/a/b and /a_b collapse to the same cache filename, so one screen's HTML\n" +
      "        would be served for another",
  );
}

// serveCachedDocument looks the root up with cacheName("https://www.wesuplus.com/")
// — the same function — so consistency is guaranteed by construction. What
// matters is that it is distinguishable from every other route.
const rootValue = labelled("ROOT");
const anyRouteCache = byUrl.get("https://www.wesuplus.com/library")?.cache;
if (!rootValue || rootValue === anyRouteCache || !rootValue.includes("root")) {
  fail(
    `the root URL is cached as "${rootValue}", which does not stand apart from\n` +
      `        an ordinary route ("${anyRouteCache}") — the deep-link fallback\n` +
      "        would serve the wrong screen",
  );
}

    if (!failures.length) {
      notes.push(
        `the real classification was executed on ${expect.length} URLs: purchase, storage, ` +
          "Lenco and audio never touch the cache, hashed assets never touch the network",
      );
    }
  } catch (e) {
    fail(
      `the classification probe failed to run: ${String(e.stdout ?? "")}${String(e.stderr ?? e.message)}`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

console.log("  offline shell can actually serve a page");
for (const n of notes) console.log(`    ${n}`);

if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  console.error("\n  offline in the app is unproven");
  process.exit(1);
}