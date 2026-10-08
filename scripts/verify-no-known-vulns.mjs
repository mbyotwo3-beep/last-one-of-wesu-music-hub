/**
 * Refuse to build with a dependency the deploy host will reject.
 *
 * The host blocked a deploy because @tanstack/react-start 1.168.26 carries
 * CVE-2026-102989 (XSS). It offered an env-var bypass, which is exactly the
 * wrong move: the bypass silences the platform, not the vulnerability.
 *
 * Instead the dependency is upgraded, and this check makes sure nobody
 * downgrades it again — either by accident or by "pinning back to what worked".
 *
 * Run: node scripts/verify-no-known-vulns.mjs   (also wired as `prebuild`)
 */
import { readFileSync } from "node:fs";

/**
 * Minimum known-safe versions. Bump these when the host raises its bar.
 * Keep the advisory reference in the comment — a bare version number is a trap
 * for the next person.
 */
const MIN_SAFE = {
  // CVE-2026-102989 — XSS.
  "@tanstack/react-start": "1.168.60",
};

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

const problems = [];

/** Numeric-aware compare so 1.168.9 < 1.168.60 (string compare gets this wrong). */
function isBelow(actual, minimum) {
  const a = String(actual).split(/[.\-+]/);
  const b = String(minimum).split(/[.\-+]/);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = Number(a[i] ?? 0);
    const y = Number(b[i] ?? 0);
    if (Number.isNaN(x) || Number.isNaN(y)) return String(actual) !== String(minimum);
    if (x !== y) return x < y;
  }
  return false;
}

for (const [name, minimum] of Object.entries(MIN_SAFE)) {
  const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  const locked = lock.packages?.[`node_modules/${name}`]?.version;

  if (!declared) {
    problems.push(`${name}: not declared in package.json`);
    continue;
  }
  // Strip a leading range so `^1.168.60` is judged on its floor.
  const declaredVersion = declared.replace(/^[\^~>=<\s]*/, "");
  if (isBelow(declaredVersion, minimum)) {
    problems.push(
      `${name}: package.json pins ${declaredVersion}, which is below the minimum safe ${minimum}`,
    );
  }
  if (locked && isBelow(locked, minimum)) {
    problems.push(
      `${name}: package-lock.json resolves ${locked}, which is below the minimum safe ${minimum}`,
    );
  }
}

if (problems.length) {
  console.error("FATAL: known-vulnerable dependency versions.\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\n  The deploy host refuses to build these. Upgrade, do not bypass.");
  console.error("  Bypassing only silences the platform, not the vulnerability.\n");
  process.exit(1);
}

console.log(
  `  dependency floors ok (${Object.entries(MIN_SAFE)
    .map(([n, v]) => `${n}>=${v}`)
    .join(", ")})`,
);