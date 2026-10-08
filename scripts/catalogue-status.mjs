/**
 * Exact, RLS-accurate catalogue counts — what a LISTENER can actually see.
 *
 * `?limit=1000` silently caps at the API's max-rows setting, so an earlier
 * probe reported 5 songs when 17 were approved. `Prefer: count=exact` plus a
 * 0-0 range returns the true total in Content-Range without transferring rows.
 *
 * Run: node scripts/catalogue-status.mjs
 * Read-only.
 */
import { readFileSync } from "node:fs";

function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };
const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Prefer: "count=exact",
  Range: "0-499",
};

if (!url || !key) {
  console.error("No Supabase url/publishable key in .env or .env.local");
  process.exit(1);
}

/** Retry: this network drops connections often enough to make a single-shot
 *  probe report a false zero. */
async function fetchWithRetry(url_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url_, { headers });
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

async function table(name, cols) {
  const r = await fetchWithRetry(`${url}/rest/v1/${name}?select=${cols}`);
  if (!r.ok) return { name, error: r.status };
  const contentRange = r.headers.get("content-range") ?? "";
  const total = Number(contentRange.match(/\/(\d+)$/)?.[1] ?? "0");
  const body = await r.json();
  return { name, total, rows: Array.isArray(body) ? body : [] };
}

const songs = await table("songs", "id,title,status,price,audio_url,cover_url,album_id,artist_id");
const albums = await table("albums", "id,title,status,cover_url,price");
const artists = await table("artists", "id,name,status");

console.log(`\nCatalogue — ${url}`);
console.log("(counts are what an anonymous listener can see: RLS applies)");

function report(t) {
  if (t.error) {
    console.log(`${t.name}: ERROR ${t.error}`);
    return null;
  }
  const byStatus = {};
  for (const r of t.rows) byStatus[r.status ?? "?"] = (byStatus[r.status ?? "?"] ?? 0) + 1;
  const parts =
    Object.entries(byStatus)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ") || "none";
  console.log(`${t.name}: ${t.total} total  (${parts})`);
  return t;
}

const s = report(songs);
report(albums);
const a = report(artists);

if (s) {
  const noAudio = s.rows.filter((x) => !x.audio_url);
  const noCover = s.rows.filter((x) => !x.cover_url);
  const free = s.rows.filter((x) => Number(x.price ?? 0) === 0);
  const onAlbum = s.rows.filter((x) => x.album_id);
  console.log(
    `\n  missing audio : ${noAudio.length}${noAudio.length ? " — " + noAudio.map((x) => x.title).join(", ") : ""}`,
  );
  console.log(`  missing cover : ${noCover.length}`);
  console.log(`  free (K0)    : ${free.length}`);
  console.log(`  on an album  : ${onAlbum.length} of ${s.total}`);

  console.log("\nTitles:");
  for (const x of s.rows) {
    const flags = [];
    if (!x.audio_url) flags.push("NO-AUDIO");
    if (!x.cover_url) flags.push("NO-COVER");
    if (Number(x.price ?? 0) === 0) flags.push("FREE");
    if (!x.album_id) flags.push("no-album");
    console.log(
      `  ${x.status.padEnd(9)} K${Number(x.price ?? 0)
        .toFixed(2)
        .padStart(6)}  ${x.title}${flags.length ? "   [" + flags.join(", ") + "]" : ""}`,
    );
  }
}
if (a) {
  console.log("\nArtists:");
  for (const x of a.rows) console.log(`  ${x.status.padEnd(9)} ${x.name}`);
}
console.log("");
