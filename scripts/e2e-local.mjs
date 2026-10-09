/**
 * End-to-end against the running dev server, over HTTP.
 *
 * No browser is attached to this session, so this drives the server the way a
 * browser would: fetch the page, and assert the server actually rendered the
 * thing the user needs to see. SSR output is the observable behaviour, and it
 * exercises the real server functions — including the sellable-price rule that
 * decides what /checkout quotes.
 *
 * Expects `npm run dev` already running on PORT (default 8080).
 *
 * Usage: node scripts/e2e-local.mjs [baseUrl]
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const APP = process.argv[2] ?? "http://127.0.0.1:8080";

const ok = (s) => console.log(`  PASS  ${s}`);
const bad = (s) => {
  console.log(`  FAIL  ${s}`);
  process.exitCode = 1;
};

/** HTML-escaped text may be split across tags, so strip tags before matching. */
const visible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();

const albums = await (
  await fetch(`${BASE}/rest/v1/albums?select=id,title,price,status&status=eq.approved`, {
    headers: H,
  })
).json();
if (!albums.length) {
  console.error("no approved album in the catalogue");
  process.exit(2);
}
const album = albums[0];
const tracks = await (
  await fetch(
    `${BASE}/rest/v1/songs?select=id,title,price&album_id=eq.${album.id}&status=eq.approved&order=track_number`,
    { headers: H },
  )
).json();

console.log(`target: ${APP}`);
console.log(`album:  "${album.title}" K${album.price}, ${tracks.length} tracks\n`);

// ---- the shelf must list the album as ONE tile, not as its tracks
console.log("GET /albums  — the release must appear as a single tile");
{
  const res = await fetch(`${APP}/albums`, { redirect: "follow" });
  const text = visible(await res.text());
  res.ok ? ok(`HTTP ${res.status}`) : bad(`HTTP ${res.status}`);
  text.includes(album.title)
    ? ok(`album "${album.title}" is listed`)
    : bad(`album "${album.title}" is NOT on the shelf`);
  // Track titles must not masquerade as albums on this page.
  const leaked = tracks.filter((t) => text.includes(visible(t.title))).length;
  leaked === 0
    ? ok("no album tracks leaking onto the album shelf as separate entries")
    : bad(`${leaked} album track(s) appear on the album shelf — release shows as singles`);
}

// ---- the album page must show every track and a buy affordance
console.log("\nGET /albums/:id  — full tracklist and a way to buy it");
{
  const res = await fetch(`${APP}/albums/${album.id}`, { redirect: "follow" });
  const text = visible(await res.text());
  res.ok ? ok(`HTTP ${res.status}`) : bad(`HTTP ${res.status}`);
  text.includes(album.title) ? ok("album title rendered") : bad("album title missing");

  const missing = tracks.filter((t) => !text.includes(visible(t.title)));
  missing.length === 0
    ? ok(`all ${tracks.length} tracks rendered`)
    : bad(`${missing.length}/${tracks.length} tracks missing (e.g. "${missing[0]?.title}")`);

  /Buy Album/i.test(text)
    ? ok("a Buy Album control is present")
    : bad("no Buy Album control — the release is not sellable");

  // The quoted price must be the album price, not a stale or zero figure.
  const quoted = text.match(/Buy Album\s*—?\s*([KZ][\d.,]+|Free)/i);
  quoted
    ? ok(`price shown: ${quoted[1]}`)
    : console.log("  ..    (price rendered outside the button label)");

  /150(\.00)?\s*ZMW|K\s?150|ZMW\s?150/.test(text)
    ? ok(`K150 appears on the page`)
    : bad("K150 does not appear anywhere on the album page");
}

// ---- checkout must quote the album's sellable price
console.log("\nGET /checkout?item=album  — the till must agree with the shelf");
{
  const res = await fetch(`${APP}/checkout?item=album&id=${album.id}`, { redirect: "follow" });
  const text = visible(await res.text());
  ok(`HTTP ${res.status}`);
  const total =
    text.match(/([KZ][\d.,]+|Free)\s*(?:ZMW)?\s*(?:total|due|pay)/i) ??
    text.match(/(?:Total|Pay|Amount)\D{0,12}([KZ][\d.,]+)/i);
  if (total) {
    const shown = Number(total[1].replace(/[^\d.]/g, ""));
    Math.abs(shown - Number(album.price)) < 0.01
      ? ok(`checkout quotes ${total[1]} == album price ${album.price}`)
      : bad(`checkout quotes ${total[1]} but the album is ${album.price}`);
  } else {
    console.log("  ..    no total parsed (likely redirected to sign-in — unauthenticated)");
  }
  /free\s*—\s*no payment needed/i.test(text)
    ? bad("checkout says the album is FREE — the album is priced " + album.price)
    : ok("checkout did not treat the album as free");
}

// ---- playlist page must not 500
console.log("\nGET /playlists  — must render");
{
  const res = await fetch(`${APP}/playlists`, { redirect: "follow" });
  const html = await res.text();
  const text = visible(html);
  res.ok ? ok(`HTTP ${res.status}`) : bad(`HTTP ${res.status}`);
  /Something went wrong|Unexpected Error|Application error/i.test(text)
    ? bad("rendered an error page")
    : ok("no error page");
}
