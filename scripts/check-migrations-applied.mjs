/**
 * Is the latest migration actually applied?
 *
 * A working service-role key makes this answerable without the SQL editor:
 * PostgREST exposes each database function as an RPC endpoint, so a function
 * that only exists after a migration returns 404 until that migration is run.
 * No schema introspection and no guessing.
 *
 * Read only — these functions are SELECT-only, and get_artist_available_balance
 * is called with a deliberately non-existent id so it returns 0.
 *
 * Usage: node scripts/check-migrations-applied.mjs
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

/** Function -> which migration creates it. */
const PROBES = [
  ["absorbed_royalties_summary", {}, "20261009120000_fix_unclaimed_collaborator_royalty.sql"],
  [
    "get_artist_available_balance",
    { artist_uuid: "00000000-0000-0000-0000-000000000000" },
    "20260902162937 (baseline)",
  ],
];

console.log("migration probe via PostgREST RPC\n");
let missing = 0;
for (const [fn, args, migration] of PROBES) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  const exists = res.ok && !/Could not find the function/i.test(body);
  if (!exists) missing++;
  console.log(`  ${exists ? "APPLIED " : "MISSING "} ${fn}`);
  console.log(`           from ${migration}`);
  if (!exists) console.log(`           HTTP ${res.status}: ${body.slice(0, 120)}`);
}

console.log(
  missing
    ? `\n${missing} migration(s) NOT applied — run the SQL before trusting that behaviour.`
    : "\nall probed migrations are applied",
);
