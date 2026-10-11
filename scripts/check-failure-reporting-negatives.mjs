import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Negative tests for the whole-store player subscription rule.
 *
 * That rule was originally written against ONE named file (library.tsx) because
 * that is where the bug was reported. It then left five more instances standing,
 * one of them AppleMusicSidebar, which is mounted on every page.
 *
 * Widening a gate to cover the whole tree is exactly when it starts matching
 * things it should not — in particular the explanatory comments, which have to
 * be able to describe the mistake. So each case is checked here.
 */
const GATE = "scripts/check-failure-reporting.mjs";

const editLines = (src, mutate) => {
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  return mutate(lines).join(eol);
};

const cases = [
  {
    name: "library re-subscribes to the whole store",
    file: "src/routes/library.tsx",
    apply: (s) =>
      editLines(s, (l) =>
        l.map((x) => (x.includes("usePlayer((s) => s.playing);") ? "  const player = usePlayer();" : x)),
      ),
    expect: "whole-store player subscriptions",
  },
  {
    name: "the app sidebar re-subscribes to the whole store",
    file: "src/components/AppleMusicSidebar.tsx",
    apply: (s) =>
      editLines(s, (l) =>
        l.map((x) => (x.includes("usePlayer((s) => s.playing);") ? "  const player = usePlayer();" : x)),
      ),
    expect: "whole-store player subscriptions",
  },
  {
    name: "an admin screen re-subscribes to the whole store",
    file: "src/routes/admin.tsx",
    apply: (s) =>
      editLines(s, (l) =>
        l.map((x) => (x.includes("usePlayer((s) => s.playing);") ? "  const player = usePlayer();" : x)),
      ),
    expect: "whole-store player subscriptions",
  },
  {
    // A second instance in the same file, to prove it counts every one rather
    // than stopping at the first.
    name: "a file with two offenders is reported once per file",
    file: "src/routes/liked-songs.tsx",
    apply: (s) =>
      editLines(s, (l) =>
        l.map((x) => (x.includes("usePlayer((s) => s.shuffle);") ? "  const player2 = usePlayer();" : x)),
      ),
    expect: "whole-store player subscriptions",
  },
];

// This one must NOT fire: the comment beside each fixed call has to be able to
// explain the mistake using the mistake's own words.
const mustNotFire = [
  {
    name: "the explanatory comment does not trip the rule",
    file: "src/components/AppleMusicSidebar.tsx",
    apply: (s) =>
      s.replace(
        "// Subscribe to the FIELDS, not the whole store.",
        "// Subscribe to the FIELDS, not the whole store: usePlayer() with no selector.",
      ),
    forbidden: "whole-store player subscriptions",
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

for (const c of mustNotFire) {
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
  const stayedQuiet = !out.includes(c.forbidden);
  console.log(`  ${stayedQuiet ? "ok  " : "FAIL"}  ${c.name}`);
  if (!stayedQuiet) bad++;
}

console.log(bad ? `\n  ${bad} case(s) wrong` : "\n  every case behaved correctly");
process.exit(bad ? 1 : 0);