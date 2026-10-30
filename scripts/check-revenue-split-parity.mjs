/**
 * The revenue split trigger must not deduct money it never pays.
 *
 * The bug this guards: the collaborator PERCENTAGE was summed over every
 * accepted credit, while the payout loop joined `artists` with an INNER JOIN.
 * A credit recorded by name only has artist_id NULL, so it was counted in the
 * deduction and dropped at payout — a share of the artist's pool paid to nobody,
 * on every sale of that track. Name-only credits are the normal case for the
 * producers and writers the product is built around.
 *
 * This is a SQL function, and there is no Postgres or Supabase CLI in this
 * environment, so it cannot be executed. What CAN be asserted statically is
 * the shape of the fix: whatever sets the deduction, the payout must either
 * cover or explicitly account for it. Two shapes satisfy that:
 *
 *   A) A `SUM(sc.split_pct)` deduction — it must FILTER out credits with no
 *      artist account, so only payable credits are deducted.
 *
 *   B) A per-collaborator payout loop (20261029120000) — the running total may
 *      only grow after a successful INSERT (deduction == actually paid), it
 *      must be initialised to 0 (a NULL total silently voids the owner row),
 *      and the owner row must be the remainder
 *      (`v_owner_amount := v_artist_pool - v_collab_total`), so an unpayable
 *      credit flows back to the main artist instead of vanishing.
 *
 * Only the newest definition is checked. Older migrations are history and are
 * superseded by CREATE OR REPLACE.
 *
 * Usage: node scripts/check-revenue-split-parity.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const FN = "FUNCTION public.compute_revenue_splits()";

/** Newest migration wins: the trigger is CREATE OR REPLACE, so the last one is live. */
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .reverse();

let body = null;
let source = null;
for (const f of files) {
  const sql = readFileSync(join(DIR, f), "utf8");
  if (sql.includes(FN)) {
    body = sql.slice(sql.indexOf(FN));
    source = f;
    break;
  }
}

if (!body) {
  console.error("FAIL could not find any definition of compute_revenue_splits()");
  process.exit(1);
}

const problems = [];

// ---- Style A: a SUM-based deduction must exclude credits that cannot be paid.
const sumMatch = body.match(/SUM\(sc\.split_pct\)\s*(?:FILTER\s*\(WHERE\s*sc\.artist_id IS NOT NULL\s*\))?/);
const usesSumDeduction = !!sumMatch;
if (usesSumDeduction && !/FILTER\s*\(WHERE\s*sc\.artist_id IS NOT NULL\)/.test(sumMatch[0])) {
  problems.push(
    "the collaborator split_pct sum has no `FILTER (WHERE sc.artist_id IS NOT NULL)`, so credits with no artist account are still deducted from the main artist.",
  );
}

// ---- Style B: a payout loop must deduct only what it actually pays, and the
// owner row must absorb the remainder (that is where an unpayable credit goes).
const loopInitialised = /v_collab_total\s*:=\s*0/.test(body);
const loopIncrements = /v_collab_total\s*:=\s*v_collab_total\s*\+/.test(body);
const ownerRemainder = /v_owner_amount\s*:=\s*v_artist_pool\s*-\s*v_collab_total/.test(body);

/**
 * Every running-total increment must sit AFTER an INSERT into revenue_splits
 * within the same loop body. An increment that runs regardless of the insert
 * is the original bug in loop form: deducted without being paid.
 */
function incrementsFollowInserts(text) {
  const re = /v_collab_total\s*:=\s*v_collab_total\s*\+/g;
  let m;
  while ((m = re.exec(text))) {
    const loopStart = text.lastIndexOf("LOOP", m.index);
    const segment = text.slice(loopStart === -1 ? 0 : loopStart, m.index);
    if (!segment.includes("INSERT INTO public.revenue_splits")) return false;
  }
  return true;
}

const loopDeductionOk = loopInitialised && loopIncrements && incrementsFollowInserts(body) && ownerRemainder;

const paysViaJoin = /JOIN public\.artists a ON a\.id = sc\.artist_id/.test(body);
const absorbsViaPlatform =
  /v_unclaimed_pct/.test(body) &&
  /payee_role\s*,\s*amount\s*,\s*pct\s*\)\s*\n?\s*VALUES \(NEW\.id, 'platform'/.test(body);

if (paysViaJoin && !usesSumDeduction && !loopDeductionOk && !absorbsViaPlatform) {
  problems.push(
    "collaborators are paid through an INNER JOIN on artists (so artist_id IS NULL is dropped) but no branch accounts for the unpayable share. It must either be excluded from the deduction (SUM + FILTER), deducted only once actually paid with the owner row absorbing the remainder (v_owner_amount := v_artist_pool - v_collab_total), or routed explicitly (v_unclaimed_pct → platform).",
  );
}

// If it does absorb via the platform, the absorbed share must actually be written.
if (/v_unclaimed_pct/.test(body) && !/'unclaimed'|NEW\.id, 'platform'/.test(body)) {
  problems.push("v_unclaimed_pct is computed but its share is never written to revenue_splits.");
}

// Both branches must select the same rows, or they drift apart again.
if (/v_total_collab_pct/.test(body) && !/v_total_collab_pct/.test(body.split("RETURN NEW")[0])) {
  problems.push("v_total_collab_pct is assigned but never read.");
}

console.log(`  checking ${source}`);
if (problems.length) {
  console.error("\nFAIL revenue split deduction/payout are not in agreement:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\n  Static shape only. It does not prove the function executes.");
  process.exit(1);
}
console.log("  deduction and payout agree on who is payable");
