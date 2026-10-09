/**
 * Why is the album missing from the shelf?
 *
 * The album is approved with 12 approved tracks, yet GET /albums does not list
 * it. listAlbums runs through getPublicSupabase() — the PUBLISHABLE key — so
 * RLS applies. This replays that exact query under both keys to find out whether
 * the row is being filtered by policy rather than by data.
 *
 * Read only. Usage: node scripts/e2e-album-shelf.mjs
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
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
if (!BASE || !SERVICE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
if (!PUBLIC) {
  console.error("No publishable key found — the shelf cannot be tested");
  process.exit(2);
}

const SERVICE_H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const PUBLIC_H = { apikey: PUBLIC, Authorization: `Bearer ${PUBLIC}` };

// Exactly what listAlbums asks for. The select list is comma-separated — the
// first draft of this test used '&' and PostgREST rejected the whole query,
// which looked like an RLS problem but was just a malformed test.
const QUERY =
  "id,title,cover_url,price,release_date,genre,artist:artists(id,name)," +
  "songs!inner(id,price,status,duration)";

async function attempt(label, headers) {
  const url =
    `${BASE}/rest/v1/albums?select=${encodeURIComponent(QUERY)}` +
    `&status=eq.approved&songs.status=eq.approved&order=release_date.desc&limit=60`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let data = [];
  try {
    data = JSON.parse(text) ?? [];
  } catch {
    /* handled below */
  }
  console.log(`\n${label}`);
  console.log(`  HTTP ${res.status}`);
  if (!res.ok) console.log(`  ${text.slice(0, 200)}`);
  if (Array.isArray(data)) {
    console.log(`  albums returned: ${data.length}`);
    for (const a of data) {
      console.log(
        `    "${a.title}" price=${a.price} songs=${a.songs?.length ?? "?"} artist=${a.artist?.name ?? "?"}`,
      );
    }
  }
  return { status: res.status, count: Array.isArray(data) ? data.length : -1, data };
}

console.log("listAlbums query, as the shelf issues it\n");

const viaService = await attempt("service role (bypasses RLS)", SERVICE_H);
const viaPublic = await attempt("publishable key (RLS applies — what the shelf uses)", PUBLIC_H);

// Which albums exist at all?
const all = await (
  await fetch(`${BASE}/rest/v1/albums?select=id,title,status,price&order=created_at`, {
    headers: SERVICE_H,
  })
).json();
console.log(`\nall albums in the table: ${all.length}`);
for (const a of all) console.log(`  "${a.title}" status=${a.status} price=${a.price}`);

// And their track statuses.
for (const a of all) {
  const songs = await (
    await fetch(`${BASE}/rest/v1/songs?select=id,status&album_id=eq.${a.id}`, {
      headers: SERVICE_H,
    })
  ).json();
  const counts = {};
  for (const s of songs) counts[s.status] = (counts[s.status] ?? 0) + 1;
  console.log(`  "${a.title}" track statuses: ${JSON.stringify(counts)}`);
}

console.log(
  `\nverdict: ${
    viaService.count > viaPublic.count
      ? `RLS is hiding ${viaService.count - viaPublic.count} album(s) from signed-out visitors`
      : viaPublic.count === 0 && viaService.count > 0
        ? "RLS hides EVERY album from signed-out visitors — the shelf can never populate for a guest"
        : "RLS is not the cause; the difference is elsewhere"
  }`,
);
