/**
 * A regression gate for the route cross-fade.
 *
 * TWO parts were needed for the transition and each can vanish independently:
 *
 *   1. The router opts in (`defaultViewTransition`). Without it the platform's
 *      snapshot machinery is never engaged and every navigation is a hard
 *      swap — the exact flicker this exists to remove. Mid-flight-refactor
 *      removals are exactly the failure this project has shipped before.
 *   2. The CSS scopes the transition to `main` and respects reduced motion.
 *      Unscoped, the whole page — top bar, tab bar, player — cross-fades on
 *      every navigation, which reads as everything blinking at once and is
 *      actively worse than no transition. The reduced-motion guard is not
 *      decoration: a motion-sensitive listener with a hard swap is less
 *      nauseating than a slide they cannot switch off.
 */
import { readFileSync } from "node:fs";

const router = readFileSync("src/router.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

const checks = [
  {
    name: "the router opts into view transitions",
    ok: /defaultViewTransition:\s*true/.test(router),
    why: "without it every route change is a hard swap — no cross-fade anywhere",
  },
  {
    name: "only the content area transitions",
    ok: /view-transition-name:\s*main-content/.test(styles),
    why:
      "unscoped, the top bar, tab bar and player all cross-fade on every " +
      "navigation and the phone reads as an app blinking at itself",
  },
  {
    name: "the old and new layers are both animated",
    ok: /::view-transition-old\(main-content\)/.test(styles) &&
      /::view-transition-new\(main-content\)/.test(styles),
    why: "animating only the new layer makes the old one paint for an extra frame",
  },
  {
    name: "reduced motion gets the hard swap, not the slide",
    ok: /prefers-reduced-motion:\s*reduce[\s\S]*?view-transition-name:\s*none/.test(styles),
    why: "a listener who turned animations off gets them off, including this one",
  },
];

let failed = 0;
console.log("  route transitions");
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`    ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` — ${c.why}`}`);
}

if (failed) {
  console.error(`\n  ${failed} route-transition guarantee(s) lost — do not ship this`);
  process.exit(1);
}
console.log("  navigation cross-fades like a phone app");
