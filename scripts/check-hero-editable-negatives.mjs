/**
 * Negative tests for the rewritten hero section of check-hero-editable.mjs.
 *
 * WHY
 *
 * That section used to assert the presence of the string "FALLBACK, not the
 * hero" — a rule that fails when a correct refactor deletes the comment and says
 * nothing about behaviour. Rewriting a gate into real behavioural rules is
 * exactly when it is most likely to be wrong in a new way, so each rule is
 * broken deliberately and has to be caught.
 *
 * Line-based, and comments are stripped first: this file has been bitten by a
 * check matching its own rationale twice already.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/check-hero-editable.mjs";
const HOME = "src/routes/index.tsx";
const POOL = "src/lib/hero-pool.ts";
const HOOK = "src/hooks/use-hero-pool.ts";

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
    name: "the fixed pick comes back, pinning the hero to one album",
    file: HOME,
    apply: onLine(
      "const empty =",
      "const heroPick = featured[0] ?? recentAlbums[0];\n  const empty =",
    ),
    expect: "still falls back to a fixed",
  },
  {
    name: "the random pool starts winning over admin slides",
    file: HOME,
    apply: onLine(
      "usingAdminSlides ? adminHeroSlides : heroPool",
      "heroPool.length ? heroPool : adminHeroSlides",
    ),
    expect: "does not clearly prefer admin slides",
  },
  {
    // Replacing the songs argument with albums. The earlier version truncated
    // `trending` but left `newReleases` on the line, and those words also appear
    // in the shelves below the hero, so the gate could not tell.
    name: "songs stop reaching the pool",
    file: HOME,
    apply: onLine(
      "useMemo(() => [...trending, ...newReleases], [trending, newReleases])",
      "useMemo(() => [...featured, ...recentAlbums], [featured, recentAlbums])",
    ),
    expect: "is not built from both songs and albums",
  },
  {
    name: "randomness moves into render, breaking hydration",
    file: HOME,
    apply: onLine(
      "const usingAdminSlides =",
      "const r = Math.random();\n  const usingAdminSlides =",
    ),
    expect: "calls Math.random() during render",
  },
  {
    name: "the pool itself becomes non-deterministic",
    file: POOL,
    apply: onLine(
      "export function shuffleHeroPool<T>(pool: T[], seed: number): T[] {",
      "export function shuffleHeroPool<T>(pool: T[], seed: number): T[] {\n  Math.random();",
    ),
    expect: "must be a pure function of its input",
  },
  {
    name: "the hook stops randomising, so every visitor gets one order",
    file: HOOK,
    apply: onLine("Math.floor(Math.random() * 0x7fffffff)", "pool.length"),
    expect: "never randomises",
  },
  {
    // The guard is removed entirely: the ref becomes a plain object and the
    // conditional read goes with it. Removing only the read left the two
    // assignment statements satisfying a check that looked for `.current`.
    name: "the once-only guard is removed, so the hero never settles",
    file: HOOK,
    apply: (src) => {
      const eol = src.includes("\r\n") ? "\r\n" : "\n";
      return src
        .split(/\r?\n/)
        .map((l) =>
          l.includes("if (shuffled.current || pool.length < 2) return;")
            ? l.replace("shuffled.current || ", "")
            : l,
        )
        .join(eol)
        .replace("useRef(false)", "{ current: true } as { current: boolean }");
    },
    expect: "has no once-only guard",
  },
  {
    name: "the admin editor tab stops rendering",
    file: "src/routes/admin.tsx",
    apply: onLine("<HeroCarouselBuilder />", "<SomethingElse />"),
    expect: "does not RENDER HeroCarouselBuilder",
  },
  {
    name: "the admin tab is unmounted but the import left behind",
    file: "src/routes/admin.tsx",
    apply: onLine("<HeroCarouselBuilder />", "<SomethingElse />"),
    expect: "does not RENDER HeroCarouselBuilder",
  },
];

let bad = 0;
for (const c of cases) {
  let original;
  try {
    original = readFileSync(c.file, "utf8");
  } catch {
    console.log(`  SKIP  ${c.name} - ${c.file} not found`);
    bad++;
    continue;
  }
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
