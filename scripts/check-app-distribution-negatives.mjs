/**
 * Negative tests for the rewritten section 6 of check-app-distribution.mjs.
 *
 * WHY
 *
 * That gate required MainActivity to configure ServiceWorkerController. Encoding
 * the bug: it failed the build on the correct code, and would have passed on code
 * that cannot serve a page at all. A gate must assert a mechanism that works.
 *
 * Rewriting a gate is exactly when it is most likely to be wrong in a new way, so
 * both new rules are broken deliberately and have to be caught.
 *
 * Written as a file rather than inline PowerShell: nested quotes and backticks in
 * a one-liner broke the parser before a single mutation ran, which looks
 * identical to "nothing to fix".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/check-app-distribution.mjs";
const MAIN = "android/app/src/main/java/com/wesu/music/MainActivity.java";
const SHELL = "android/app/src/main/java/com/wesu/music/OfflineShell.java";

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
    name: "MainActivity stops resolving through OfflineShell",
    file: MAIN,
    apply: onLine("OfflineShell.resolve(", "dropped("),
    expect: "does not resolve requests through OfflineShell",
  },
  {
    name: "the shell goes cache-first",
    file: SHELL,
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
    expect: "consults the cache before the network",
  },
];

let bad = 0;
for (const c of cases) {
  const original = readFileSync(c.file, "utf8");
  const mutated = c.apply(original);
  if (mutated === original) {
    console.log(`  SKIP  ${c.name} - mutation did not apply`);
    bad++;
    continue;
  }
  writeFileSync(c.file, mutated);
  let out = "";
  try {
    out = execFileSync("node", [GATE], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  } finally {
    writeFileSync(c.file, original);
  }
  const fired = out.includes(c.expect);
  console.log(`  ${fired ? "ok  " : "FAIL"}  ${c.name}`);
  if (!fired) bad++;
}

console.log(bad ? `\n  ${bad} mutation(s) slipped through` : "\n  every mutation was caught");
process.exit(bad ? 1 : 0);