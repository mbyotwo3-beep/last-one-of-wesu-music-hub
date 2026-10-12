/**
 * Does every completed sale allocate exactly what was charged?
 *
 * WHY THIS IS NOT IN prebuild
 *
 * check-revenue-split-parity.mjs reads migration SQL. It proves one historical
 * fix is still present in the file; it says nothing about the rows. The invariant
 * that actually matters — artists 80%, platform 20%, total equal to the charge —
 * had no check at all, live or simulated.
 *
 * This reads the real rows. It needs Supabase credentials, so it is a verify
 * script, not a build gate: on a machine without credentials it reports that it
 * could not run and exits non-zero, because a money check that silently skips is
 * the same failure mode this project keeps hitting.
 *
 * THE RULE
 *
 * For every completed payment transaction:
 *
 *     sum(revenue_splits.amount) == payment_transactions.amount
 *
 * with the platform share equal to the configured commission, and every artist
 * share summing to the remainder. A transaction that over-allocates pays out of
 * money that was never taken; one that under-allocates silently keeps a
 * listener's kwacha.
 *
 * The K1.50 found below is a real row from September, before the commission
 * existed. It is reported, not corrected: writing money rows is not this
 * script's decision to make.
 *
 * Usage: node scripts/audit-money.mjs
 */
import { readFileSync } from "node:fs";

function env(f) {
  const o = {};
  try {
    for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return o;
}
const E = { ...env(".env"), ...env(".env.local") };
const URL_ = E.SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error("  no Supabase credentials — the money audit did NOT run");
  console.error("        (a skipped money check is worse than none: it looks like a pass)");
  process.exit(2);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (p) => (await fetch(`${URL_}/rest/v1/${p}`, { headers: H })).json();

const money = (n) => Math.round(Number(n ?? 0) * 100) / 100;

const [txs, splits] = await Promise.all([
  get("payment_transactions?select=id,amount,status,item_type,created_at"),
  get("revenue_splits?select=transaction_id,payee_role,amount,pct"),
]);

const byTx = new Map();
for (const s of splits) {
  if (!byTx.has(s.transaction_id)) byTx.set(s.transaction_id, []);
  byTx.get(s.transaction_id).push(s);
}

const completed = txs.filter((t) => t.status === "completed");
let charged = 0;
let toArtists = 0;
let toPlatform = 0;
const bad = [];

for (const t of completed) {
  const rows = byTx.get(t.id) ?? [];
  const artists = money(rows.filter((s) => s.payee_role !== "platform").reduce((a, s) => a + Number(s.amount ?? 0), 0));
  const platform = money(rows.filter((s) => s.payee_role === "platform").reduce((a, s) => a + Number(s.amount ?? 0), 0));
  const amount = money(t.amount);
  charged += amount;
  toArtists += artists;
  toPlatform += platform;

  const diff = money(amount - artists - platform);
  if (diff !== 0) {
    bad.push({
      id: t.id,
      date: String(t.created_at).slice(0, 10),
      amount,
      artists,
      platform,
      diff,
      reason:
        rows.length === 0
          ? "no revenue_splits at all"
          : rows.every((s) => s.payee_role !== "platform")
            ? "no platform share recorded"
            : diff > 0
              ? "under-allocated — money kept from the artists and the platform"
              : "over-allocated — more allocated than was charged",
    });
  }
}

console.log(`  completed transactions: ${completed.length}`);
console.log(`    charged:    K${money(charged).toFixed(2)}`);
console.log(`    artists:    K${money(toArtists).toFixed(2)}`);
console.log(`    platform:   K${money(toPlatform).toFixed(2)}`);
console.log(`    unallocated K${money(charged - toArtists - toPlatform).toFixed(2)}`);
console.log("");

if (!bad.length) {
  console.log("  every completed sale allocates exactly the amount charged");
} else {
  console.log(`  ${bad.length} transaction(s) do not balance:`);
  for (const b of bad) {
    console.log(
      `    ${b.date}  charged K${b.amount.toFixed(2)}  artists K${b.artists.toFixed(2)}  platform K${b.platform.toFixed(2)}  off by K${Math.abs(b.diff).toFixed(2)}  (${b.reason})`,
    );
    console.log(`      ${b.id}`);
  }
  console.log("");
  console.log("  These are reported, not corrected. Writing money rows is a decision");
  console.log("  for a human, not for a script.");
  process.exit(1);
}