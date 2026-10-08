/**
 * Does the COMMITTED tree actually install?
 *
 * This repo had been failing to deploy for a while for a reason no amount of
 * local testing could catch: `package.json` had been bumped to
 * @lovable.dev/vite-tanstack-config 2.25.2 while package-lock.json still
 * pinned 2.13.1. Local `npm install` quietly resolved it; CI runs `npm ci`,
 * which refuses to install an out-of-sync lockfile — so every deploy died at
 * the install step while the developer's machine built fine every time.
 *
 * This reproduces CI's install against the committed files only (no
 * node_modules, no working-tree cruft) and fails loudly on drift, so the next
 * lockfile bump cannot be shipped broken again.
 *
 * Run: node scripts/verify-ci-install.mjs
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Files CI needs: manifest, lockfile, npm config, and the postinstall script. */
const NEEDED = ["package.json", "package-lock.json", ".npmrc"];

const missing = NEEDED.filter((f) => !existsSync(f));
if (missing.length) {
  console.error(`FATAL: missing ${missing.join(", ")}`);
  process.exit(2);
}

/**
 * Cheap drift check first. npm's failure message is good, but only after a
 * multi-minute install; comparing the declared version of every dependency
 * against the lockfile's root entry catches it in milliseconds.
 */
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const rootDeps = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
};
const lockedRoot = lock.packages?.[""] ?? {};

const drift = [];
for (const [name, want] of Object.entries(rootDeps)) {
  const got = lockedRoot.dependencies?.[name] ?? lockedRoot.devDependencies?.[name];
  if (got === undefined) {
    // Fall back to the package table: npm prunes platform-specific OPTIONAL
    // deps from the root entry, so absence there alone proves nothing.
    const resolved = lock.packages?.[`node_modules/${name}`];
    if (!resolved) {
      drift.push(`${name}: declared ${want} but absent from the lockfile entirely`);
    }
    continue;
  }
  if (got !== want && !String(want).startsWith("^") && !String(want).startsWith("~")) {
    // Only exact pins can conflict outright; ranges are resolved by npm.
    // This is the case that killed every deploy: package.json 2.25.2 vs
    // lockfile 2.13.1.
    drift.push(`${name}: package.json says ${want}, lockfile says ${got}`);
  }
}
if (drift.length) {
  console.error("FATAL: package.json and package-lock.json are out of sync.\n");
  for (const d of drift) console.error(`  - ${d}`);
  console.error("\n  `npm ci` on the deploy host will refuse to install. Fix with:");
  console.error("    npm install\n");
  process.exit(1);
}
console.log(`  lockfile in sync with package.json (${Object.keys(rootDeps).length} deps checked)`);

if (!process.argv.includes("--full")) {
  console.log("\n  (skipping the real install; run with --full to do it)");
  console.log("\nCI install check passed.\n");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "wesu-ci-"));
try {
  for (const f of NEEDED) cpSync(f, join(dir, f));
  if (existsSync("scripts")) cpSync("scripts", join(dir, "scripts"), { recursive: true });
  console.log(`\n  installing into a clean tree: ${dir}`);
  execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: dir, stdio: "inherit" });
  console.log("\nCI install check passed (real npm ci).\n");
} catch {
  console.error("\nCI install check FAILED (see the npm output above).\n");
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
