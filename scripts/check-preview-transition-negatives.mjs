/**
 * Negative tests for check-preview-transition.
 *
 * The rule protects a perceived-quality fix, so "it passes" is worthless until it
 * has been shown to fail against each way the fix can quietly disappear:
 * unmounted, reverted to hover-only, warming nothing, or caching nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/check-preview-transition.mjs";

/**
 * Replace EVERY occurrence, not just the first.
 *
 * TrackRow and TrackCard each attach onPointerDown twice, once per tappable
 * element. A single-occurrence replace left the second one in place and the gate
 * stayed green — the mutation proved nothing, which is exactly the ambiguity a
 * negative test exists to remove.
 */
const replaceAll = (find, replacement) => (src) => src.split(find).join(replacement);

const cases = [
  {
    name: "the mobile row stops warming entirely",
    file: "src/components/mobile/shared/SongRow.tsx",
    apply: replaceAll("onPointerDown={warmThis}", "onPointerDown={() => {}}"),
    expect: "warms on the wrong signal",
  },
  {
    name: "the desktop row reverts to hover-only",
    file: "src/components/TrackRow.tsx",
    apply: replaceAll("onPointerDown={warmThis}", "onPointerEnter={warmThis}"),
    expect: "warms on the wrong signal",
  },
  {
    name: "the grid card loses its warm",
    file: "src/components/discover/TrackCard.tsx",
    apply: replaceAll("warmThis", "unused"),
    expect: "warms on the wrong signal",
  },
  {
    name: "the warm stops writing the cache PlayerBar reads",
    file: "src/hooks/use-intent-warm.ts",
    apply: replaceAll("setCachedAudioUrl(songId, uid, res.url, true);", "void res;"),
    expect: "never writes the cache",
  },
  {
    name: "the warm starts firing for free songs too",
    file: "src/hooks/use-intent-warm.ts",
    apply: replaceAll("if (Number(price ?? 0) <= 0) return;", ""),
    expect: "does not skip free songs",
  },
  {
    name: "a failed warm is no longer swallowed",
    file: "src/hooks/use-intent-warm.ts",
    apply: replaceAll("} catch {", "} catch (e) { throw e; } finally { if (false) {"),
    expect: "has no catch",
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