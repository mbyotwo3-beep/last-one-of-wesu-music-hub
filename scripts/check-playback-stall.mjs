/**
 * A regression gate for the playback stall watchdog.
 *
 * WHY A GATE AND NOT JUST TESTS
 *
 * The rule is pure and its suite proves the decision table. The wiring is
 * where it can quietly die: a refactor that stops importing stallDecision,
 * removes the interval, or (subtlest of all, and the most likely to "simplify
 * cleanly" later) drops the position-restore in the recovery — turning the
 * silent repair into a silent RESTART. A song that resumes from 0:00 after
 * 15 stall seconds is worse than the bug: it LOSES what the listener was
 * hearing, which is exactly what a music app may never do silently.
 */
import { readFileSync } from "node:fs";

const player = readFileSync("src/components/PlayerBar.tsx", "utf8");

const checks = [
  {
    name: "the HTML engine watches for dead buffers",
    ok: /stallDecision\(/.test(player) && /setInterval\(\s*\(\)\s*=>/.test(player),
    why: "without the tick, a stalled/waiting element spins forever silently",
  },
  {
    name: "recovery keeps the listener mid-song",
    ok: /audio\.currentTime = saved;/.test(player),
    why:
      "repairing by restart loses the exact content the listener was hearing; " +
      "a music app may never do that silently",
  },
  {
    name: "recovery pauses before reload, plays after re-seek",
    ok: /audio\.pause\(\);\s*\n\s*audio\.load\(\);/.test(player) &&
      /audio\.play\(\)\.catch\(\(\) => \{\}\);/.test(player),
    why: "reloading while live leaves the store watching a mid-teardown element",
  },
  {
    name: "the silent priming track can never trigger the watchdog",
    ok: /audio\.src\.startsWith\("data:"\)/.test(player),
    why: "the unlock placeholder legitimately never advances; recovering around it would fight the engine",
  },
  {
    name: "exactly one silent repair per asset — the flag survives the reload's own playing event",
    ok: /recovered = true;/.test(player) &&
      (() => {
        // Match only INSIDE the markPlaying block: a reset elsewhere (like
        // the per-track-change reset in the interval body) is correct code.
        const markBlock = /const markPlaying = \(\) => \{[\s\S]*?\};/.exec(player)?.[0] ?? "";
        return markBlock !== "" && !markBlock.includes("recovered");
      })(),
    why: "resetting on the recovery's own reload turns a dead asset into an infinite repair loop",
  },
];

let failed = 0;
console.log("  playback stall watchdog");
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`    ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` — ${c.why}`}`);
}

if (failed) {
  console.error(`\n  ${failed} stall-watchdog guarantee(s) lost — do not ship this`);
  process.exit(1);
}
console.log("  dead buffers get one silent, position-keeping repair");
