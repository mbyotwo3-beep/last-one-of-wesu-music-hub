/**
 * Negative tests for check-role-gating.
 *
 * The rule is about behaviour that only shows up under failure, so every case
 * here reproduces the exact regression rather than something adjacent to it.
 *
 * Two of the original diagnoses for this bug were wrong — "nothing writes
 * user_roles" and "RLS blocks the read" — both disproved against the live
 * database. Neither would have been caught by any gate, because neither was in
 * the code. That is the reason this file exists: to pin the fix that the data
 * actually pointed to.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/check-role-gating.mjs";

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
    // Every occurrence, not just the destructuring: `failed: isError` and the
    // `!isError &&` guards elsewhere kept satisfying a /isError/ search.
    name: "the hook stops looking at isError again",
    file: "src/hooks/use-roles.tsx",
    apply: (s) => s.replace(/isError/g, "wasFailed"),
    expect: "does not look at isError",
  },
  {
    name: "the failure branch is removed, so a failed read denies access",
    file: "src/components/RoleGate.tsx",
    apply: onLine("if (failed) {", "if (false) {"),
    expect: "no 'we could not check' branch",
  },
  {
    name: "the failure screen offers no retry",
    file: "src/components/RoleGate.tsx",
    apply: onLine("Try again", "Go back"),
    expect: "offers no way to retry",
  },
  {
    name: "the denial screen is moved ahead of the failure screen",
    file: "src/components/RoleGate.tsx",
    apply: (src) => {
      // Swap the two guards: denial first.
      return src.replace("if (failed) {", "if (DENIED_FIRST) {").replace("if (!ok) {", "if (failed) {").replace("if (DENIED_FIRST) {", "if (!ok) {");
    },
    expect: "renders BEFORE the failed-check screen",
  },
  {
    name: "the sidebar offers Become an Artist unconditionally again",
    file: "src/components/AppleMusicSidebar.tsx",
    apply: onLine("{checked && !isArtist && (", "{!isArtist && ("),
    expect: 'offers "Become an Artist" without first establishing',
  },
  {
    name: "the mobile menu offers it to artists again",
    file: "src/components/mobile/BottomTabBar.tsx",
    apply: onLine("{checked && !isArtist && user && (", "{!isArtist && user && ("),
    expect: 'offers "Become an Artist" without first establishing',
  },
  {
    name: "retries drop back to two",
    file: "src/hooks/use-roles.tsx",
    apply: onLine("retry: 3,", "retry: 2,"),
    expect: "retries fewer than 3 times",
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