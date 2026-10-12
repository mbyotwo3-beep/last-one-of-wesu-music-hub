/**
 * Deliberately break the offline shell and confirm the gate notices.
 *
 * WHY
 *
 * A gate that has never been shown to fail is not evidence. In this project a
 * check has silently passed against broken code six separate times — matching a
 * comment instead of code, matching a function name instead of its output, and
 * reading a file that no longer existed. Each one looked exactly like a working
 * gate.
 *
 * So every rule here gets broken on purpose and the gate has to catch it. A
 * mutation that does not apply is reported as a failure, because a pattern that
 * matched nothing and a check that did not fire look identical from outside.
 *
 * Line-based mutation, not regex over the file: these files use CRLF, and two
 * regex mutations silently matched nothing in an earlier run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = "android/app/src/main/java/com/wesu/music/OfflineShell.java";
const MAIN = "android/app/src/main/java/com/wesu/music/MainActivity.java";
const SHELL = SRC;

/**
 * Replace the matched substring WITHIN the first line that contains it.
 *
 * It must substitute, not overwrite the line. Assigning the replacement to
 * lines[i] discarded everything after the match, so `|| u.matches("(?s).*\\.`
 * became the whole line and left an unterminated string literal — javac then
 * reported a syntax error and the gate reported that instead of the rule it
 * exists to protect.
 */
const onLine = (find, replacement) => (src) => {
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(find));
  if (i === -1) return src;
  lines[i] = lines[i].replace(find, replacement);
  return lines.join(eol);
};

const cases = [
  {
    name: "audio is allowed into the cache",
    file: SRC,
    apply: onLine(
      'u.matches("(?s).*\\\\.(mp3|m4a|aac|ogg|wav|opus|flac)',
      'false && u.matches("(?s).*\\\\.(mp3|m4a|aac|ogg|wav|opus|flac)',
    ),
    expect: "expected document=false, got document=true",
  },
  {
    // The probe URL https://abcd.supabase.co/rest/v1/songs also matches the
    // rest/v1 arm, so disabling supabase.co alone did not change the result and
    // the mutation silently proved nothing. This one is auth/v1, which only
    // supabase.co can catch.
    name: "Supabase auth responses are cached",
    file: SRC,
    apply: onLine('u.contains("supabase.co")', 'false && u.contains("supabase.co")'),
    expect: "expected document=false, got document=true",
  },
  {
    // Line 117 is `return u.contains("/api/")` — the arm has no leading `||`,
    // which is why an earlier mutation targeting `|| u.contains("/api/")` silently
    // did not apply.
    name: "purchase API responses are cached",
    file: SRC,
    apply: onLine('return u.contains("/api/")', 'return false && u.contains("/api/")'),
    expect: "expected document=false, got document=true",
  },
  {
    // A different host, so the supabase.co arm cannot mask this one.
    name: "object storage paths are cached",
    file: SRC,
    apply: onLine('u.contains("/storage/v1/")', 'false && u.contains("/storage/v1/")'),
    expect: "expected document=false, got document=true",
  },
  {
    name: "Lenco checkout responses are cached",
    file: SRC,
    apply: onLine('u.contains("lenco")', 'false && u.contains("lenco")'),
    expect: "expected document=false, got document=true",
  },
  {
    name: "RSC payloads are treated as pages",
    file: SRC,
    apply: onLine('u.contains("?_routes")', 'u.contains("?_routes_DISABLED")'),
    expect: "expected document=false, got document=true",
  },
  {
    // /assets/9f3a2b has no file extension, so only the path arm can classify
    // it. Disabling that arm left a .js probe still matching the regex fallback
    // and the gate correctly saw nothing change.
    name: "hashed assets stop being served from the APK",
    file: SRC,
    apply: onLine('path.startsWith("/assets/")', 'false && path.startsWith("/assets/")'),
    expect: "expected immutable=true, got immutable=false",
  },
  {
    // Inserted rather than replaced: an earlier version swapped the calls in a
    // way that would not compile, and the gate reported a compile error instead
    // of the rule it exists to protect.
    name: "the cache is consulted before the network",
    file: SRC,
    apply: (src) => {
      const eol = src.includes("\r\n") ? "\r\n" : "\n";
      const lines = src.split(/\r?\n/);
      const i = lines.findIndex((l) => l.includes("byte[] fresh = fetch(url, requestHeaders);"));
      if (i === -1) return src;
      lines.splice(
        i,
        0,
        "        if (serveCachedDocument(ctx, url) != null) return serveCachedDocument(ctx, url);",
      );
      return lines.join(eol);
    },
    expect: "tries the CACHE before the network",
  },
  {
    name: "flat cache filenames collide again",
    file: SRC,
    apply: onLine('return readable + "-" + Integer.toHexString(h);', "return readable;"),
    expect: "collapse to the same cache filename",
  },
  {
    name: "MainActivity never calls the resolver",
    file: MAIN,
    apply: onLine("OfflineShell.resolve(", "ignoredResolve("),
    expect: "does not call OfflineShell.resolve",
  },
  {
    name: "the resolved response is computed then thrown away",
    file: MAIN,
    apply: onLine("if (resolved != null) return resolved;", "// dropped"),
    expect: "does not return it",
  },
  {
    name: "a lookalike host is answered from the cache",
    file: MAIN,
    apply: onLine(
      'if (!"www.wesuplus.com".equals(host)) return null;',
      'if (host == null || !host.endsWith("wesuplus.com")) return null;',
    ),
    expect: "host check is not an exact match",
  },
  {
    name: "cookies are dropped from the network fetch",
    file: SRC,
    apply: onLine("conn.setRequestProperty(key, val);", "conn.setRequestProperty(\"Accept\", \"*/*\");"),
    expect: "does not forward the request",
  },
  {
    name: "the service worker call comes back, implying it does the work",
    file: MAIN,
    apply: onLine(
      "checkWebViewIsUsable(bridge);",
      "checkWebViewIsUsable(bridge);\n        enableServiceWorkerInterception();",
    ),
    expect: "ServiceWorkerController call is still live",
  },
  {
    // The exact bug shipped in vc34: the root document served as the fallback
    // for any unsaved path, which put the homepage's markup and hydration
    // payload under /library's URL.
    name: "the root document is served again as the fallback for unsaved paths",
    file: SHELL,
    apply: onLine("if (isRoot) {", "if (true) {"),
    expect: "falls back to the ROOT document",
  },
  {
    name: "the root guard is dropped from the branch that serves the root",
    file: SHELL,
    apply: (src) => src.replace(/if\s*\(\s*isRoot[^)]*\)\s*\{/, "{"),
    expect: "falls back to the ROOT document",
  },
  {
    name: "the fallback page claims a connection is required",
    file: "android/app/src/main/assets/error.html",
    apply: onLine(
      "This page isn't saved on this phone",
      "You're offline - reconnect to open Wesu+ and enjoy them",
    ),
    expect: "reconnect to open",
  },
  {
    name: "the fallback page stops explaining what is not saved",
    file: "android/app/src/main/assets/error.html",
    apply: onLine("isn't saved on this phone", "is unavailable"),
    expect: "does not explain that the screen has not been",
  },
  {
    // Both mentions, not one: the page says "Downloads" on one line and
    // "library" on the next, so removing a single line left the rule satisfied.
    name: "the fallback page stops pointing at the screens that do work",
    file: "android/app/src/main/assets/error.html",
    apply: (src) =>
      src
        .replace("Your downloads are always safe and always play — open <b>Downloads</b> or", "Nothing works offline without a connection — open the")
        .replace("<b>Your library</b>", "the site"),
    expect: "does not point at Downloads or the library",
  },
];

let bad = 0;
for (const c of cases) {
  const original = readFileSync(c.file, "utf8");
  const mutated = c.apply(original);
  if (mutated === original) {
    console.log(`  SKIP  ${c.name} — mutation did not apply`);
    bad++;
    continue;
  }
  writeFileSync(c.file, mutated);
  let out = "";
  try {
    out = execFileSync("node", ["scripts/check-offline-shell.mjs"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  } finally {
    writeFileSync(c.file, original);
  }
  const fired = out.includes(c.expect);
  console.log(`  ${fired ? "ok  " : "FAIL"}  ${c.name}`);
  if (!fired) {
    bad++;
    console.log(
      out
        .split(/\r?\n/)
        .filter((l) => l.includes("FAIL"))
        .map((l) => `          ${l.trim()}`)
        .join("\n"),
    );
  }
}

console.log(bad ? `\n  ${bad} mutation(s) slipped through` : "\n  every mutation was caught");
process.exit(bad ? 1 : 0);