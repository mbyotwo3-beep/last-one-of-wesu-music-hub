import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Prove the library null-deref fix by putting the bug back.
 *
 * The first attempt at this used a PowerShell .Replace with a literal "\r\n".
 * The file is LF, so the replace matched nothing, the revert silently did
 * nothing, and the test passed 10/10 against the UNFIXED code — which looked
 * exactly like "the fix is not needed".
 *
 * Line-based, and the mutation must actually apply or it reports SKIP.
 */
const FILE = "src/routes/library.tsx";
const TEST = "src/routes/__tests__/library-render.test.tsx";

const eol = readFileSync(FILE, "utf8").includes("\r\n") ? "\r\n" : "\n";

function mutate(linePred, replacement) {
  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);
  const i = lines.findIndex(linePred);
  if (i === -1) return null;
  lines[i] = replacement;
  return lines.join(eol);
}

const cases = [
  {
    name: "the null filter on playlist_songs is removed",
    make: (src) => src.replace(/\n[ \t]*\.filter\(\(ps: any\) => ps != null\)/, ""),
    expectFail: true,
  },
  {
    name: "the optional chaining on position is removed",
    make: (src) =>
      src.replace("(a?.position ?? 0) - (b?.position ?? 0)", "(a.position ?? 0) - (b.position ?? 0)"),
    expectFail: true,
  },
  {
    name: "both guards removed at once",
    make: (src) =>
      src
        .replace(/\n[ \t]*\.filter\(\(ps: any\) => ps != null\)/, "")
        .replace("(a?.position ?? 0) - (b?.position ?? 0)", "(a.position ?? 0) - (b.position ?? 0)"),
    expectFail: true,
  },
];

function runTest() {
  try {
    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    execFileSync(cmd, ["vitest", "--run", TEST], { stdio: ["ignore", "pipe", "pipe"], shell: true });
    return true;
  } catch (err) {
    // console.error(err);
    return false;
  }
}

let bad = 0;
for (const c of cases) {
  const original = readFileSync(FILE, "utf8");
  const mutated = c.make(original);
  if (mutated === original) {
    console.log(`  SKIP  ${c.name} - mutation did not apply`);
    bad++;
    continue;
  }
  writeFileSync(FILE, mutated);
  const passed = runTest();
  writeFileSync(FILE, original);

  const correct = c.expectFail ? !passed : passed;
  console.log(`  ${correct ? "ok  " : "FAIL"}  ${c.name} (test ${passed ? "passed" : "failed"} with it)`);
  if (!correct) bad++;
}

const restored = runTest();
console.log(`  ${restored ? "ok  " : "FAIL"}  restored code still passes`);
if (!restored) bad++;

console.log(bad ? `\n  ${bad} case(s) wrong` : "\n  the guard is genuinely load-bearing");
process.exit(bad ? 1 : 0);