/**
 * Where the money actually is.
 *
 * Gross transaction value and the sum of revenue_splits disagree by a wide
 * margin, and the two answers mean very different things:
 *
 *   - money never taken (abandoned mobile-money pushes)  -> nothing to reconcile
 *   - money taken but never settled (fulfilment_failed)   -> refund owed
 *
 * revenue_splits rows are only written when a transaction transitions to
 * completed, so the gap is expected in the first case and alarming in the second.
 * This splits it out.
 *
 * Read only. Usage: node scripts/audit-money.mjs
 */
import { readFileSync } from "node:fs";

function envFile(name) {
  try {
    const out = {};
    for (const line of readFileSync(name, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...envFile(".env"), ...envFile(".env.local") };
const BASE = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const tx = await (
  await fetch(
    `${BASE}/rest/v1/payment_transactions?select=id,amount,status,item_type,created_at,provider_ref`,
    { headers: H },
  )
).json();

const money = (n) => `K${Number(n || 0).toFixed(2)}`;
const group = {};
for (const t of tx) {
  const k = `${t.status}/${t.item_type}`;
  group[k] = group[k] ?? { n: 0, amt: 0 };
  group[k].n++;
  group[k].amt += Number(t.amount ?? 0);
}

console.log(`transactions: ${tx.length}\n`);
console.log("status/item_type          count      amount");
for (const [k, v] of Object.entries(group).sort((a, b) => b[1].amt - a[1].amt)) {
  console.log(`${k.padEnd(24)}${String(v.n).padStart(4)}  ${money(v.amt).padStart(12)}`);
}

const gross = tx.reduce((s, t) => s + Number(t.amount ?? 0), 0);
const completed = tx
  .filter((t) => t.status === "completed")
  .reduce((s, t) => s + Number(t.amount ?? 0), 0);
const settledMoney = completed * 0.8; // platform takes 20%

console.log(`\ngross of all transactions   ${money(gross)}`);
console.log(`completed transactions     ${money(completed)}`);
console.log(`expected artist pool (80%) ${money(settledMoney)}`);

const splits = await (
  await fetch(`${BASE}/rest/v1/revenue_splits?select=payee_role,amount`, { headers: H })
).json();
const allocated = splits.reduce((s, r) => s + Number(r.amount ?? 0), 0);
console.log(`actually allocated         ${money(allocated)}`);

const gap = settledMoney - allocated;
console.log(
  `\ndelta vs artist pool: ${money(Math.abs(gap))}` +
    (Math.abs(gap) < 0.02
      ? "  (balanced)"
      : gap > 0
        ? "  UNDER-ALLOCATED — splits are missing for settled sales"
        : "  OVER-ALLOCATED"),
);

const stuck = tx.filter(
  (t) => t.status === "pending" && Date.now() - new Date(t.created_at).getTime() > 3600_000,
);
if (stuck.length) {
  console.log(
    `\n${stuck.length} transaction(s) still 'pending' after an hour, ${money(
      stuck.reduce((s, t) => s + Number(t.amount ?? 0), 0),
    )}:`,
  );
  for (const t of stuck.slice(0, 8)) {
    console.log(
      `  ${t.item_type} ${money(t.amount)}  created ${new Date(t.created_at).toISOString().slice(0, 16)}  provider_ref=${t.provider_ref ?? "none"}`,
    );
  }
}

const failedFulfilment = tx.filter((t) => t.status === "fulfillment_failed");
if (failedFulfilment.length) {
  console.log(
    `\nFULFILMENT FAILED on ${failedFulfilment.length} transaction(s), ${money(
      failedFulfilment.reduce((s, t) => s + Number(t.amount ?? 0), 0),
    )} — money taken, nothing delivered:`,
  );
  for (const t of failedFulfilment) {
    console.log(
      `  ${t.item_type} ${money(t.amount)}  ${new Date(t.created_at).toISOString().slice(0, 16)}`,
    );
  }
}

const failed = tx.filter((t) => t.status === "failed");
console.log(
  `\nfailed (declined/expired): ${failed.length}, ${money(failed.reduce((s, t) => s + Number(t.amount ?? 0), 0))}`,
);
