/**
 * Why is the home page's server HTML empty?
 *
 * getHomeDiscover fans out over several shelves and the loader swallows any
 * failure, so a broken shelf is indistinguishable from an empty catalogue. This
 * replays each shelf query under the publishable key — the one the shelf
 * actually uses — and reports rows and errors separately.
 *
 * Read only. Usage: node scripts/e2e-home-shelves.mjs
 */
import { readFileSync } from "node:fs";

function envFile(name) {
  try {
    const out = {};
    for (const line of readFileSync(name, "utf8").split("\n")) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
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
const PUB = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !PUB) {
  console.error("Missing SUPABASE_URL or publishable key");
  process.exit(2);
}
const PH = { apikey: PUB, Authorization: `Bearer ${PUB}` };
const SH = { apikey: SVC, Authorization: `Bearer ${SVC}` };

async function run(label, path) {
  const out = {};
  for (const [who, h] of [
    ["anon", PH],
    ["service", SH],
  ]) {
    const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: h });
    const text = await res.text();
    let n = -1;
    try {
      const d = JSON.parse(text);
      n = Array.isArray(d) ? d.length : -1;
      out[who] = { status: res.status, n, error: d?.message ?? d?.code ?? null };
    } catch {
      out[who] = { status: res.status, n: -1, error: text.slice(0, 90) };
    }
  }
  const flag = out.anon.n === out.service.n ? "  " : "!!";
  console.log(
    `${flag} ${label.padEnd(34)} anon=${String(out.anon.n).padStart(4)} (${out.anon.status})  service=${String(out.service.n).padStart(4)}`,
  );
  if (out.anon.error) console.log(`     anon error: ${out.anon.error}`);
  return out;
}

console.log("home shelves: anon (what visitors get) vs service (the truth)\n");

await run(
  "albums featured=true",
  "albums?select=id,title,featured,status&featured=eq.true&status=eq.approved&limit=12",
);
await run(
  "albums recent",
  "albums?select=id,title,status&status=eq.approved&order=release_date.desc&limit=12",
);
await run(
  "songs trending",
  "songs?select=id,title,status,is_trending&status=eq.approved&is_trending=eq.true&order=play_count.desc&limit=12",
);
await run(
  "songs recent",
  "songs?select=id,title,status&status=eq.approved&order=created_at.desc&limit=12",
);
await run(
  "songs new",
  "songs?select=id,title,status&status=eq.approved&order=release_date.desc&limit=12",
);
await run(
  "artists top",
  "artists?select=id,name,status&status=eq.approved&order=monthly_listeners.desc&limit=10",
);
await run(
  "playlists with songs",
  "playlists?select=id,name,is_public,playlist_songs(song_id)&limit=12",
);
// The column is `active`, not `is_active`. The first draft of this test used
// is_active, PostgREST returned 400 "column does not exist", and the output
// looked like a missing-table defect in the app. It was a typo in the test.
await run("homepage carousels", "home_carousels?select=id,active&active=eq.true&limit=10");

const albums = await (
  await fetch(`${BASE}/rest/v1/albums?select=id,title,featured,status`, { headers: SH })
).json();
console.log("\nalbum flags:");
for (const a of albums) console.log(`  "${a.title}" featured=${a.featured} status=${a.status}`);

const songs = await (
  await fetch(
    `${BASE}/rest/v1/songs?select=id,title,is_trending,play_count&status=eq.approved&limit=5`,
    {
      headers: SH,
    },
  )
).json();
console.log("\nsong flags (first 5 approved):");
for (const s of songs)
  console.log(`  "${s.title}" is_trending=${s.is_trending} plays=${s.play_count}`);
