/**
 * Regression gate for resume-from-background route recovery.
 *
 * WHY THIS EXISTS
 *
 * "This page didn't load" recurred on /browse in the mobile app, and the
 * decisive report was WHEN — after the app sat in the background. Coming
 * back, a WebView fails in three ways that all draw the same fault screen,
 * and each has exactly one silent fix. This gate pins the wiring so a
 * refactor cannot quietly remove the healing without failing the build:
 *
 *   - the boundary consults the pure decision, not ad-hoc string checks;
 *   - every attempt is RECORDED BEFORE IT RUNS — an unrecorded auto-reload
 *     would loop forever on private-mode WebViews (the nightmare case);
 *   - offline never heals automatically — the offline notice owns that;
 *   - the resume refresher exists at the root, gated by the pure stopwatch
 *     rule, so the doze-expired token race dies before the burst starts.
 */
import { readFileSync } from "node:fs";

const routeError = readFileSync("src/components/RouteError.tsx", "utf8");
const rule = readFileSync("src/lib/resume-recovery.ts", "utf8");
const root = readFileSync("src/routes/__root.tsx", "utf8");

const checks = [
  {
    name: "the boundary heals via the pure decision, not ad-hoc matching",
    ok: /recoveryDecision\(\{/.test(routeError) && /from "@\/lib\/resume-recovery"/.test(routeError),
    why: "scattered regexes drift from the tested classifier; one rule, tested pure",
  },
  {
    name: "offline never auto-heals — the offline notice owns it",
    ok: /if \(i\.offline\) return "none";/.test(rule) &&
      routeError.indexOf("isOfflineTransportFailure(error)") < routeError.indexOf("if (healing) {"),
    why: "a truly-down link cannot be healed by a token refresh or a re-render",
  },
  {
    name: "every attempt is recorded before it runs",
    ok: /if \(!markRecoveryAttempt\("reload", Date\.now\(\)\)\) return;/.test(routeError) &&
      /if \(!markRecoveryAttempt\("reauth", Date\.now\(\)\)\) return;/.test(routeError),
    why: "an unrecorded auto-reload is the infinite loop the design exists to prevent",
  },
  {
    name: "the token refresh runs before the fault screen, not inside the render",
    ok: /if \(!markRecoveryAttempt\("reauth", Date\.now\(\)\)\) return;/.test(routeError) &&
      /refreshSessionIfStale\(\)/.test(routeError),
    why: "state updates in render are the classic boundary bug; the effect owns it",
  },
  {
    name: "the healed screen cannot hide the fault indefinitely",
    ok: /finally \{\s*\n?\s*setHealing\(false\);/.test(routeError),
    why: "a failed heal must always end on the honest screen with the reference code",
  },
  {
    name: "the root refreshes the session on a LONG background, not tab flicks",
    ok: /resumeRefreshDecision\(\{ hiddenForMs, online: navigator\.onLine !== false \}\)/.test(root),
    why: "refreshing on every visibility flip burns round-trips for nothing",
  },
];

let failed = 0;
console.log("  resume-from-background route recovery");
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`    ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` — ${c.why}`}`);
}

if (failed) {
  console.error(`\n  ${failed} resume-recovery guarantee(s) lost — do not ship this`);
  process.exit(1);
}
console.log("  backgrounded sessions heal once, offline stays offline\n");
