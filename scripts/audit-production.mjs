/**
 * Read-only production audit over the service-role client.
 *
 * The service key was rejected for most of the build, so production state could
 * only be guessed at. Now that it is accepted, the outstanding questions can be
 * answered with evidence instead:
 *
 *   - is the catalogue actually sellable (albums need price + approved tracks)?
 *   - has the fan-out migration landed, or are albums still unpriced/unapproved?
 *   - how much money did the collaborator leak actually cost, and how many
 *     credits is it still affecting?
 *
 * READ ONLY. Every call is a select. Nothing here writes, and nothing here
 * prints a key — only counts, sums and identifiers.
 *
 * Usage: node scripts/audit-production.mjs
 */
import { readFileSync } from "node:fs";

function envFile(name) {
  try {
    const raw = readFileSync(name, "utf8");
    const out = {};
    for (const line of raw.split("\n")) {
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
const BASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE_URL || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

async function q(path, { count, head } = {}) {
  const url = new URL(`${BASE_URL}/rest/v1/${path}`);
  if (count) url.searchParams.set("select", "id");
  else url.searchParams.append("select", head ?? "*");
  const res = await fetch(url, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: count ? "count=exact" : "return=minimal",
      ...(count ? {} : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} -> ${res.status} ${body.slice(0, 160)}`);
  }
  if (count) return Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
  if (res.status === 204) return [];
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const money = (n) => `K${Number(n || 0).toFixed(2)}`;
const line = (s) => console.log(`\n=== ${s} ===`);

line("catalogue");
const songs = await q("songs?select=id,status,price,album_id");
const albums = await q("albums?select=id,title,status,price");
const artists = await q("artists?select=id,status");

const approved = (xs) => xs.filter((x) => x.status === "approved");
console.log(`songs    ${songs.length} total, ${approved(songs).length} approved`);
console.log(`albums   ${albums.length} total, ${approved(albums).length} approved`);
console.log(`artists  ${artists.length} total, ${approved(artists).length} approved`);

const paidSongs = approved(songs).filter((s) => Number(s.price ?? 0) > 0);
const freeSongs = approved(songs).filter((s) => Number(s.price ?? 0) <= 0);
console.log(`         ${paidSongs.length} paid, ${freeSongs.length} free`);
console.log(
  `         approved songs on an album: ${approved(songs).filter((s) => s.album_id).length}`,
);

line("album sellability");
const unpriced = albums.filter((a) => a.price == null);
const freeAlbums = albums.filter((a) => Number(a.price ?? 0) <= 0);
console.log(`albums with NULL price : ${unpriced.length}`);
console.log(`albums priced 0        : ${freeAlbums.length}`);
const approvedAlbumsNoTracks = approved(albums).filter((a) => {
  const n = approved(songs).filter((s) => s.album_id === a.id).length;
  return n === 0;
});
console.log(
  `approved albums with NO approved track (invisible on /albums): ${approvedAlbumsNoTracks.length}`,
);

line("collaborator leak — credits with no account to pay");
const collabs = await q(
  "song_collaborators?select=id,song_id,artist_id,credit_name,split_pct,accepted,role",
);
const nameOnly = collabs.filter((c) => !c.artist_id && c.credit_name);
const nameOnlyLive = nameOnly.filter((c) => c.accepted === true);
const affectedSongs = new Set(nameOnlyLive.map((c) => c.song_id));
console.log(`total credits            : ${collabs.length}`);
console.log(`name-only credits        : ${nameOnly.length}`);
console.log(`  of those, accepted     : ${nameOnlyLive.length}`);
console.log(`  tracks affected        : ${affectedSongs.size}`);
const byRole = {};
for (const c of nameOnlyLive) byRole[c.role] = (byRole[c.role] ?? 0) + 1;
console.log(`  by role                : ${JSON.stringify(byRole)}`);

const totalSplit = (await q("payment_transactions?select=amount,item_type,status")).reduce(
  (s, t) => s + Number(t.amount ?? 0),
  0,
);
console.log(`\ngross value of all transactions: ${money(totalSplit)}`);

line("revenue splits actually written");
const splits = await q("revenue_splits?select=payee_role,amount");
const byRole2 = {};
for (const s of splits) {
  byRole2[s.payee_role] = (byRole2[s.payee_role] ?? 0) + Number(s.amount ?? 0);
}
for (const [role, amt] of Object.entries(byRole2)) {
  console.log(`${role.padEnd(14)} ${money(amt)}`);
}
console.log(
  `\n"unclaimed" present = ${
    "unclaimed" in byRole2
  } (expected false: that role was never created; absorbed shares go to 'platform')`,
);

line("purchases");
const purchases = await q("purchases?select=id,song_id,album_id,amount,status");
const albumReceipts = purchases.filter((p) => p.album_id && !p.song_id);
const perTrack = purchases.filter((p) => p.album_id && p.song_id);
console.log(`total purchase rows : ${purchases.length}`);
console.log(`album receipts      : ${albumReceipts.length}`);
console.log(`per-track on albums : ${perTrack.length}`);
console.log(
  `distinct albums sold: ${new Set(purchases.filter((p) => p.album_id).map((p) => p.album_id)).size}`,
);
const dupes = {};
for (const p of albumReceipts) {
  const k = `${p.album_id}`;
  dupes[k] = (dupes[k] ?? 0) + 1;
}
const dupList = Object.entries(dupes).filter(([, n]) => n > 1);
console.log(`albums sold more than once (double-charge evidence): ${dupList.length}`);

console.log("\ndone (read-only)");
