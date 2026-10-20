/**
 * Regression gate for Spotify-style boot restore and the home boot skeleton.
 *
 * WHY THIS EXISTS
 *
 * Two listener-visible defects shipped together in one report: the app
 * opened on the home page's EMPTY-STATE ("Welcome to Wesu+ / No music has
 * been published yet") during the boot fetch — a lie about the catalogue on
 * every cold start — and reopened at home no matter where the listener had
 * been. The fixes are small and can be lost as easily as they were found:
 * a render-time defaulting, a missing hook return. This gate pins them.
 */
import { readFileSync } from "node:fs";

const home = readFileSync("src/routes/index.tsx", "utf8");
const root = readFileSync("src/routes/__root.tsx", "utf8");
const rule = readFileSync("src/lib/route-restore.ts", "utf8");
const navbar = readFileSync("src/components/Navbar.tsx", "utf8");

const checks = [
  {
    name: "home gates its empty state on the feed actually arriving",
    ok: /!discoverLoading &&\s*\n?\s*!discoverError &&\s*\n?\s*featured\.length === 0/.test(home),
    why: 'defaults to [] made every cold boot say "No music has been published yet"',
  },
  {
    name: "loading shelves render skeletons, not silence or the empty state",
    ok: /discoverLoading && !discoverData \? \([\s\S]*?SkeletonShelf/.test(home),
    why: "the open must look like an app that is loading, like Spotify's",
  },
  {
    name: "a failed feed fetch draws a retry, not the fake welcome",
    ok: /discoverError \? \([\s\S]*?refetchDiscover/.test(home),
    why: "a network failure must show itself honestly with its fix",
  },
  {
    name: "the root records the last route on native",
    ok: /localStorage\.setItem\(LAST_ROUTE_KEY, fullPath\)/.test(root),
    why: "without the record there is nothing to restore",
  },
  {
    name: "the root restores it once at native boot via the tested rule",
    ok: /routeRestoreDecision\(\{/.test(root) && /router\.history\.push\(decision\.to\)/.test(root),
    why: "resume must land where the listener was, exactly once",
  },
  {
    name: "restore stays native-only and declines non-routes",
    ok: /if \(!i\.isNative\) return \{ action: "stay" \};/.test(rule) &&
      /startsWith\("\/\/"\)/.test(rule),
    why: "web deep-linking and injection strings are not ours to redirect",
  },
  {
    name: "no router-state select concatenates the parsed search object",
    ok: [root, home, rule, navbar].every(
      (t) =>
        !/location\.pathname\s*\+\s*\(?\s*[\w.]*location\.search\b(?!Str)/.test(t) &&
        !/s\.location\.search\b(?!Str)[\w. ]*;/.test(t.replace(/searchStr/g, "")),
    ),
    why: "location.search is a parsed object — `pathname + s.location.search` throws " +
      "'Cannot convert object to primitive value' on the server and 500s every SSR route; " +
      "the string form is location.searchStr",
  },
];

let failed = 0;
console.log("  boot restore + home boot skeleton");
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`    ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` — ${c.why}`}`);
}

if (failed) {
  console.error(`\n  ${failed} boot-restore guarantee(s) lost — do not ship this`);
  process.exit(1);
}
console.log("  the app opens where it was, and loading never reads as empty\n");
