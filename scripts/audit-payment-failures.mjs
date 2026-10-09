/**
 * Why are payments failing?
 *
 * 53 of 58 transactions came back 'failed' — a 91% failure rate, including two
 * album purchases. 'failed' is written when Lenco reports a failure, and the
 * reason is stored in the transaction's metadata, so the answer is in the rows.
 *
 * Also cross-checks the Lenco credentials currently configured, because an
 * expired or wrong key produces exactly this shape: every push is created and
 * every push is declined.
 *
 * Read only. Usage: node scripts/audit-payment-failures.mjs
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
    `${BASE}/rest/v1/payment_transactions?select=id,amount,status,item_type,method_code,provider,provider_ref,created_at,metadata`,
    { headers: H },
  )
).json();

console.log(`transactions: ${tx.length}\n`);

const failed = tx.filter((t) => t.status === "failed");
const reasons = new Map();
for (const t of failed) {
  const r = t.metadata?.failure_reason ?? "(no reason recorded)";
  reasons.set(r, (reasons.get(r) ?? 0) + 1);
}
console.log("failure reasons");
for (const [r, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}x  ${String(r).slice(0, 120)}`);
}

const pending = tx.filter((t) => t.status === "pending");
console.log(`\npending with no provider_ref: ${pending.filter((t) => !t.provider_ref).length}`);
console.log(
  `completed with no provider_ref: ${tx.filter((t) => t.status === "completed" && !t.provider_ref).length}`,
);

console.log("\nby method");
const byMethod = {};
for (const t of failed) {
  byMethod[t.method_code ?? "?"] = (byMethod[t.method_code ?? "?"] ?? 0) + 1;
}
for (const [m, n] of Object.entries(byMethod)) {
  console.log(`  ${m.padEnd(16)} ${n} failed`);
}

console.log("\nfirst vs last failure");
const sorted = [...failed].sort(
  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
);
if (sorted.length) {
  console.log(`  earliest ${new Date(sorted[0].created_at).toISOString().slice(0, 16)}`);
  console.log(
    `  latest   ${new Date(sorted[sorted.length - 1].created_at).toISOString().slice(0, 16)}`,
  );
}

console.log("\npayment methods table");
const mRes = await fetch(`${BASE}/rest/v1/payment_methods?select=*`, { headers: H });
if (mRes.ok) {
  const methods = await mRes.json();
  if (Array.isArray(methods) && methods.length) {
    for (const m of methods) {
      console.log(`  ${String(m.code ?? "?").padEnd(14)} enabled=${m.is_enabled}  ${m.name ?? ""}`);
    }
  } else {
    console.log(`  (empty — ${JSON.stringify(methods).slice(0, 120)})`);
  }
} else {
  console.log(`  query failed: ${mRes.status} ${(await mRes.text()).slice(0, 140)}`);
}

console.log("\nLenco credentials present in this workspace");
for (const k of Object.keys(env).filter((k) => /LENCO/i.test(k))) {
  const v = env[k];
  console.log(`  ${k.padEnd(28)} ${v ? `set (${v.length} chars)` : "empty"}`);
}
