/**
 * Negative tests for check-links-and-keys.
 *
 * This gate went through three wrong shapes before this one, and each was wrong
 * in the direction of crying wolf:
 *
 *   - it treated "/albums/$id" as a dead path, reporting 41 valid links
 *   - it built the route list with ".$" -> "/", which dropped the param name, so
 *     every dynamic link looked dead for the same reason
 *   - it flagged 214 .map() calls that build data rather than JSX, then 45 more
 *     in server functions where "<" is a comparison
 *
 * A gate that flags correct code gets ignored, which is worse than having none.
 * So both halves are broken deliberately here and must be caught, and the false
 * positives are pinned too so the next edit cannot quietly reintroduce them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/check-links-and-keys.mjs";

const onLine = (find, replacement) => (src) => {
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(find));
  if (i === -1) return src;
  lines[i] = lines[i].replace(find, replacement);
  return lines.join(eol);
};

const mustFail = [
  {
    name: "a link points at a page that was renamed away",
    file: "src/components/AppleMusicSidebar.tsx",
    apply: onLine('{ to: "/recently-added"', '{ to: "/recently-added-typo"'),
    expect: "point at a route that does not exist",
  },
  {
    name: "a link to a dynamic route with the wrong prefix",
    file: "src/components/AlbumCard.tsx",
    apply: onLine('to="/albums/$id"', 'to="/album-detail/$id"'),
    expect: "point at a route that does not exist",
  },
  {
    // Remove EVERY key in the file. Replacing only the first left two others
    // inside the detection window, so the map still looked keyed.
    name: "keys are removed from a JSX list",
    file: "src/components/CarouselShelf.tsx",
    apply: (s) => s.replace(/key=\{/g, "kkk={"),
    expect: "JSX .map() with no key",
  },
  {
    // Nav arrays are object literals, not JSX attributes. An attribute-only
    // regex never saw them at all.
    name: "a nav item points at a renamed route",
    file: "src/components/AppleMusicSidebar.tsx",
    apply: onLine('to: "/recently-added"', 'to: "/recently-added-typo"'),
    expect: "point at a route that does not exist",
  },
];

const mustPass = [
  {
    // The exact shape that produced 41 false alarms.
    name: "a dynamic link with a $param placeholder is still valid",
    file: "src/components/AlbumCard.tsx",
    apply: (s) => s,
    forbidden: "point at a route that does not exist",
  },
  {
    name: "a data .map() in a queryFn is not a missing key",
    file: "src/components/AppleMusicSidebar.tsx",
    apply: (s) => s,
    forbidden: "JSX .map() with no key",
  },
  {
    name: "server functions full of < are not components",
    file: "src/lib/music.functions.ts",
    apply: (s) => s,
    forbidden: "JSX .map() with no key",
  },
];

let bad = 0;

function run(mutatedFile) {
  try {
    return execFileSync("node", [GATE], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

for (const c of mustFail) {
  const original = readFileSync(c.file, "utf8");
  const mutated = c.apply(original);
  if (mutated === original) {
    console.log(`  SKIP  ${c.name} - mutation did not apply`);
    bad++;
    continue;
  }
  writeFileSync(c.file, mutated);
  const out = run();
  writeFileSync(c.file, original);
  const fired = out.includes(c.expect);
  console.log(`  ${fired ? "ok  " : "FAIL"}  ${c.name}`);
  if (!fired) bad++;
}

for (const c of mustPass) {
  const original = readFileSync(c.file, "utf8");
  const mutated = c.apply(original);
  writeFileSync(c.file, mutated);
  const out = run();
  writeFileSync(c.file, original);
  const quiet = !out.includes(c.forbidden);
  console.log(`  ${quiet ? "ok  " : "FAIL"}  ${c.name}`);
  if (!quiet) bad++;
}

console.log(bad ? `\n  ${bad} case(s) wrong` : "\n  every case behaved correctly");
process.exit(bad ? 1 : 0);