/**
 * Which of the local Supabase keys does the API actually accept?
 *
 * Run: node scripts/check-keys.mjs
 * Read-only: one request per variant, no writes.
 */
import { readFileSync } from "node:fs";

function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  } catch {
    /* optional file */
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };
const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const keys = {
  "SUPABASE_PUBLISHABLE_KEY": env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
};

if (!url) {
  console.error("No SUPABASE_URL in .env or .env.local");
  process.exit(1);
}

async function probe(label, key) {
  if (!key) return console.log(`  ${label}: (not set)`);
  const out = {};
  for (const [name, headers] of [
    ["apikey+bearer", { apikey: key, Authorization: `Bearer ${key}` }],
    ["apikey only", { apikey: key }],
  ]) {
    try {
      const r = await fetch(`${url}/rest/v1/songs?select=id&limit=1`, { headers });
      out[name] = r.status;
    } catch (e) {
      out[name] = `ERR ${e.message}`;
    }
  }
  // /auth/v1/health is the cheapest endpoint that validates the apikey alone.
  let health = "?";
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
    health = r.status;
  } catch (e) {
    health = `ERR`;
  }
  const role = (() => {
    try {
      const seg = key.split(".")[1];
      if (!seg || key.startsWith("sb_")) return "opaque";
      const p = seg.replace(/-/g, "+").replace(/_/g, "/");
      const json = JSON.parse(
        Buffer.from(p + "=".repeat((4 - (p.length % 4)) % 4), "base64").toString("utf8"),
      );
      return `${json.role} (ref ${json.ref})`;
    } catch {
      return "unreadable";
    }
  })();
  console.log(`  ${label}`);
  console.log(`    claims        : ${role}`);
  console.log(`    rest apikey   : ${out["apikey+bearer"]}`);
  console.log(`    rest apikey only: ${out["apikey only"]}`);
  console.log(`    auth health   : ${health}`);
  console.log(`    => ${health === 200 && out["apikey+bearer"] === 200 ? "ACCEPTED" : "REJECTED"}`);
}

console.log(`\nSupabase key probe — ${url}\n`);
for (const [label, key] of Object.entries(keys)) await probe(label, key);
console.log("");