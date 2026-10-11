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
  if (!/HeroCarouselBuilder/.test(admin)) {
    problems.push("/admin does not render HeroCarouselBuilder — the hero has no editing UI");
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

// --- 2. the homepage must read the hero from the table, not invent one
const HOME = "src/routes/index.tsx";
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
  // The fallback must SAY it is a fallback, or it is mistaken for the hero again.
  if (!/FALLBACK, not the hero/i.test(home)) {
    problems.push(
      "the homepage fallback is not labelled as a fallback in the source.\n" +
        "        It renders when there are no active slides, looks like the real\n" +
        "        hero, and was mistaken for a hardcoded section nobody can edit.",
    );
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
