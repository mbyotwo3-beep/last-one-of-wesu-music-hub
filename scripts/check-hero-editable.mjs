/**
 * Is the homepage hero editable by an admin, or is it decoration?
 *
 * WHY THIS EXISTS
 *
 * The owner reported that the homepage hero "was put in code" and could not be
 * changed. It is not in code: /admin -> Hero Carousel edits the
 * hero_carousel_slides table, and index.tsx renders it. The confusion came from
 * the FALLBACK in index.tsx.
 *
 * When hero_carousel_slides has no active rows, index.tsx renders a
 * hardcoded-looking "Featured" banner from the newest album. It is styled like
 * the real hero, so it reads as the hero and looks uneditable — when actually
 * the real hero is simply empty.
 *
 * That is a support problem caused by a fallback, not a missing feature. So:
 *
 *   1. assert the admin surface exists and is reachable, so nobody concludes
 *      the hero is hardcoded again;
 *   2. assert the fallback is labelled as a fallback in the source;
 *   3. report how many slides exist, so the empty state is visible rather than
 *      being discovered by a listener.
 *
 * Usage: node scripts/check-hero-editable.mjs
 */
import { readFileSync, existsSync } from "node:fs";

/**
 * Drop comments before checking source for a token.
 *
 * Explanatory comments here describe the very mistake a check looks for, so an
 * unstripped search matches the explanation and reports correct code as broken.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * Read .env / .env.local the way scan-apk-secrets.mjs does, so the slide count
 * works without the caller exporting anything.
 *
 * The first version read only process.env, so in every normal invocation the
 * count was silently skipped and the gate reported nothing about the empty state
 * — which is the one thing it was added to surface.
 */
function envFile(name) {
  try {
    const out = {};
    for (const line of readFileSync(name, "utf8").split("\n")) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...envFile(".env"), ...envFile(".env.local") };

const problems = [];
const notes = [];

// --- 1. the admin surface must exist and be linked from the admin nav
const ADMIN = "src/routes/admin.tsx";
const BUILDER = "src/components/HeroCarouselBuilder.tsx";
const FUNCTIONS = "src/lib/hero-carousel.functions.ts";

if (!existsSync(ADMIN)) {
  problems.push(`${ADMIN} is missing — there is no way to edit the hero`);
} else {
  const admin = readFileSync(ADMIN, "utf8");
  // Match the JSX, not the name anywhere. `import { HeroCarouselBuilder }` satisfied
  // the old check on its own, so deleting the tab — the one thing that makes the
  // hero editable — left the gate green. Found by deliberately removing it.
  if (!/<HeroCarouselBuilder/.test(admin)) {
    problems.push(
      "/admin does not RENDER HeroCarouselBuilder — the import may be there but the\n" +
        "        tab is not mounted, so the hero has no editing UI",
    );
  }
  // The tab must be reachable, not just imported.
  if (!/id:\s*"hero-carousel"/.test(admin)) {
    problems.push(
      "/admin imports the hero builder but has no 'Hero Carousel' tab, so it is\n" +
        "        unreachable in the UI",
    );
  }
  if (!/RoleGate\s+require="admin"/.test(admin)) {
    problems.push("/admin is not behind RoleGate — anyone could edit the homepage");
  }
  notes.push("/admin has a Hero Carousel tab, behind the admin role gate");
}

if (!existsSync(BUILDER)) {
  problems.push(`${BUILDER} is missing — the hero editor is gone`);
}

if (!existsSync(FUNCTIONS)) {
  problems.push(`${FUNCTIONS} is missing — the hero cannot be read or written`);
} else {
  const fns = readFileSync(FUNCTIONS, "utf8");
  for (const [name, fn] of [
    ["create", "createHeroSlide"],
    ["update", "updateHeroSlide"],
    ["delete", "deleteHeroSlide"],
  ]) {
    if (!fns.includes(fn)) problems.push(`hero ${name} is missing (${fn})`);
  }
}

// --- 2. the homepage must read the hero from the table, and rotate the
//        catalogue only while that table is empty
//
// This section previously required the string "FALLBACK, not the hero" in the
// homepage source, which only existed because the fallback was a SECOND layout
// that mimicked the real hero. Requiring a comment is a weak rule in both
// directions: it fails when a correct refactor deletes the comment, and it says
// nothing about behaviour.
//
// The contract that actually matters, and is asserted here instead:
//
//   an admin slide ALWAYS wins, and
//   only with no admin slides does the hero rotate through songs and albums
//
// The screenshot that prompted this was the hero stuck on one album forever,
// which came from a fixed `featured[0] ?? recentAlbums[0]` pick.
const HOME = "src/routes/index.tsx";
const POOL = "src/lib/hero-pool.ts";
const HOOK = "src/hooks/use-hero-pool.ts";

if (!existsSync(HOME)) {
  problems.push(`${HOME} is missing`);
} else {
  const home = readFileSync(HOME, "utf8");
  if (!/getActiveHeroSlides/.test(home)) {
    problems.push("the homepage does not read getActiveHeroSlides — the hero is not data-driven");
  }
  if (!/HeroCarousel/.test(home)) {
    problems.push("the homepage never renders <HeroCarousel />");
  }

  // The fixed pick is the bug itself. Remove it and the hero is stuck forever.
  if (/featured\s*\[\s*0\s*\]/.test(home) && /recentAlbums\s*\[\s*0\s*\]/.test(home)) {
    problems.push(
      "the homepage still falls back to a fixed `featured[0] ?? recentAlbums[0]`,\n" +
        "        which is why the hero showed the same album to everyone forever",
    );
  }

  // Admin first. `adminSlides.length > 0 ? adminSlides : pool` in either order of
  // the condition, but the ADMIN branch must be the one taken when slides exist.
  const adminWins = /usingAdminSlides\s*=\s*adminHeroSlides\.length\s*>\s*0/.test(home);
  const adminChosen = /usingAdminSlides\s*\?\s*adminHeroSlides\s*:\s*heroPool/.test(home);
  if (!adminWins || !adminChosen) {
    problems.push(
      "the homepage does not clearly prefer admin slides over the random pool.\n" +
        "        An admin who adds a slide at /admin -> Hero Carousel expects to see\n" +
        "        it, and silently rotating the catalogue instead is worse than the\n" +
        "        bug this replaced.",
    );
  } else {
    notes.push("admin slides take priority; the pool is only the empty-table case");
  }

  // Both kinds must reach the pool. This matches the POOL CONSTRUCTION, not the
  // words "trending" and "newReleases" anywhere in the file — those appear in the
  // destructuring and in the shelves below the hero, so a loose search passed
  // even with a pool fed albums only. Found by deliberately breaking it.
  const poolBuildsSongs =
    /useMemo\(\s*\(\)\s*=>\s*\[\s*\.\.\.trending/.test(home) &&
    /useMemo\(\s*\(\)\s*=>\s*\[\s*\.\.\.featured/.test(home);
  if (!poolBuildsSongs) {
    problems.push(
      "the homepage hero pool is not built from both songs and albums —\n" +
        "        it must interleave [...featured, ...recentAlbums] with\n" +
        "        [...trending, ...newReleases], or the hero rotates through\n" +
        "        albums only, which is what it did before",
    );
  } else {
    notes.push("the hero pool is fed songs as well as albums");
  }

  // Randomness during render is a hydration mismatch: the server emits one
  // slide and the client another, and React rebuilds the markup visibly.
  if (/Math\.random/.test(home)) {
    problems.push(
      "the homepage calls Math.random() during render — the server and the client\n" +
        "        will pick different hero slides and hydration will visibly rebuild",
    );
  }
}

if (!existsSync(POOL)) {
  problems.push(`${POOL} is missing — nothing builds the rotating hero pool`);
} else {
  // Comments stripped first. hero-pool.ts explains WHY it does not call
  // Math.random, in a comment that contains the words "Math.random" — so the
  // first version of this check failed against correct code, for exactly the
  // reason the comment exists. Eighth time a check has matched its own
  // explanation.
  const pool = stripComments(readFileSync(POOL, "utf8"));
  if (/Math\.random/.test(pool)) {
    problems.push(
      `${POOL} calls Math.random() — the pool must be a pure function of its input\n` +
        "        or the server and client render different slides",
    );
  } else {
    notes.push("the hero pool is deterministic, so SSR and hydration agree");
  }
}

if (!existsSync(HOOK)) {
  problems.push(`${HOOK} is missing — nothing shuffles the pool after mount`);
} else {
  const hook = stripComments(readFileSync(HOOK, "utf8"));
  if (!/Math\.random/.test(hook)) {
    problems.push(`${HOOK} never randomises, so every visitor gets the same order`);
  }
  if (!/useEffect/.test(hook)) {
    problems.push(
      `${HOOK} randomises outside an effect — doing it during render is a hydration\n` +
        "        mismatch",
    );
  }
  // Without a once-only guard the effect re-shuffles on every re-render, so the
  // hero changes item mid-rotation and the order never settles.
  //
  // It must be a real useRef CALL and a real CONDITIONAL READ. Checking for the
  // words `useRef` and `.current` was satisfied by the import line and by the
  // two assignment statements that flip the flag, so deleting only the guard
  // that consumes it still passed.
  const hasRef = /useRef\s*\(/.test(hook);
  const readsGuard = /if\s*\([^)]*\.current[^)]*\)\s*return/.test(hook);
  if (!hasRef || !readsGuard) {
    problems.push(
      `${HOOK} has no once-only guard that is actually READ (useRef(...) plus an\n` +
        "        if on .current) — the pool would be reshuffled on every re-render\n" +
        "        and the hero would never settle on an order",
    );
  } else {
    notes.push("the order is randomised once after mount, and never during render");
  }
}

// --- 3. how many slides actually exist. The empty state is invisible otherwise.
// .env.local holds only SUPABASE_SERVICE_ROLE_KEY — no URL, no anon key. The
// VITE_ variants live in .env, which is gitignored and absent on CI. So the
// count is best-effort: it runs where credentials exist and is skipped, not
// failed, where they do not.
// The project uses BOTH naming schemes: .env carries SUPABASE_URL and
// VITE_SUPABASE_URL, while .env.local carries only SUPABASE_SERVICE_ROLE_KEY.
// The first version checked VITE_ first and the plain name second, and neither
// file matched a single lookup in a normal run — so the slide count was always
// skipped and the one thing this gate exists to surface was never shown.
const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const key =
  env.SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  env.SUPABASE_ANON_KEY ??
  env.VITE_SUPABASE_ANON_KEY ??
  env.SUPABASE_SERVICE_ROLE_KEY;

if (key) {
  try {
    const res = await fetch(
      // Column names come from the migration: `active` and `position`, NOT
      // `is_active`/`display_order`. Guessing those made PostgREST return 42703
      // and the check silently reported "skipped" instead of the count.
      `${url}/rest/v1/hero_carousel_slides?select=id,title,active&order=position`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (res.ok) {
      const rows = await res.json();
      const active = rows.filter((r) => r.active !== false);
      if (!rows.length) {
        notes.push(
          "hero_carousel_slides is EMPTY — the homepage is showing its fallback banner.\n" +
            "        Add a slide at /admin -> Hero Carousel to make the hero editable.",
        );
      } else if (!active.length) {
        notes.push(
          `${rows.length} slide(s) exist but NONE are active, so the fallback still shows.`,
        );
      } else {
        notes.push(`${active.length} active hero slide(s)`);
      }
    } else {
      notes.push("could not read hero_carousel_slides (skipped the slide count)");
    }
  } catch {
    notes.push("could not reach the database (skipped the slide count)");
  }
}

console.log("  the homepage hero is admin-editable");
for (const n of notes) console.log(`    ${n}`);

if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error("\n  the hero looks hardcoded but should not be");
  process.exit(1);
}
console.log("  edit it at /admin -> Hero Carousel");
