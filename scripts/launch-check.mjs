/**
 * Pre-launch smoke check.
 *
 * Answers the two questions that decide whether we keep users:
 *   1. Is the deployed web app actually serving the latest build, error-free?
 *   2. Is the catalog big enough to be worth staying for?
 *
 * Catalog size is the churn driver that no amount of bug fixing can solve, so
 * it is checked first and fails loudly. Run: node scripts/launch-check.mjs
 */
const BASE = process.env.SMOKE_BASE ?? "https://www.wesuplus.com";

/**
 * fetch with retries. Node's fetch drops connections under a burst of ~30
 * parallel requests against a CDN, which produced phantom "route → ERR" and
 * "could not fetch bundles" failures on every run — the check looked broken
 * while the site was fine. Sequential-ish, bounded, and retried.
 */
async function grab(url, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await (await fetch(url, { redirect: "follow" })).text();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw last;
}

const ROUTES = [
  "/",
  "/artists",
  "/albums",
  "/hot-tracks",
  "/new-music",
  "/must-have",
  "/browse",
  "/search?q=test",
  "/library",
  "/downloads",
  "/queue",
  "/liked-songs",
  "/playlists",
  "/notifications",
  "/profile",
  "/get-app",
  "/contact",
  "/become-artist",
  "/auth",
  "/checkout",
  "/checkout/success",
  "/privacy",
  "/terms",
  "/terms-listener",
  "/terms-artist",
  "/labels",
];

// Feature strings that must exist in the live entry bundle. Each is a fix we
// shipped and can silently lose on redeploy.
const BUNDLE_MARKERS = [
  ["offline snapshot cache", "wesu:snap:"],
  ["notification permission ask", "wesu:notif-asked"],
  ["battery optimisation nudge", "Keep music playing when the screen is off"],
  ["public downloads route", "My downloads"],
  // Shipped with the workflow-fix batch — the fixes users report as "the
  // site doesn't work". Losing any of these on a redeploy is a silent
  // regression, so they are asserted like the rest.
  ["friendly auth errors", "already exists with that email"],
  ["playback failure surfaces on phones", "sheet-swipe-ignore"],
  ["role gate explains itself", "You need a different account type"],
  ["shuffle deck follows queue edits", "wesu-player"],
  // Album selling. The album page's Buy button is gated on the shared
  // sellable-price rule; if that import is ever dropped and the raw column
  // comes back, unpriced-but-paid albums lose their only purchase path again.
  ["album sellable price rule", "effective_price"],
  // The album page now states a derived release price. Its absence means the
  // page is reading the raw albums.price column again, which hid the Buy
  // button entirely on an album priced only by its tracks.
  ["album page states derived price", " the album"],
  // Playlists are NOT a product. Songs and albums are. These must stay ABSENT:
  // if either returns, a "pay to unlock this playlist" flow has been
  // reintroduced, which also made private playlists purchasable by UUID.
];

const MUST_NOT_SHIP = [
  ["no playlist unlock panel", "Unlock this shared playlist"],
  ["no playlist bundle checkout", "Continue to checkout — ZMW"],
];

// Copy that must NOT come back (a removed feature).
const FORBIDDEN = [["subscription tiers", "Free & Premium tiers"]];

const fail = [];
const warn = [];
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => {
  fail.push(m);
  console.log(`  FAIL  ${m}`);
};
const wrn = (m) => {
  warn.push(m);
  console.log(`  WARN  ${m}`);
};

console.log(`\nWesu+ launch check — ${BASE}\n`);

// ---- 1. Deployed bundle is current -------------------------------
console.log("[1/3] deployed bundle");
let html = "";
try {
  // Retried like every other request: a single dropped connection here used to
  // report "could not locate the entry bundle" for a site that was serving it
  // fine a second later.
  const r = await fetch(BASE + "/", { redirect: "follow" });
  html = await r.text();
  if (r.status === 200) ok("home responds 200");
  else bad(`home responded ${r.status}`);
} catch (e) {
  try {
    const r2 = await fetch(BASE + "/", { redirect: "follow" });
    html = await r2.text();
    if (r2.status === 200) ok("home responds 200 (after a retry)");
    else bad(`home responded ${r2.status}`);
  } catch (e2) {
    bad(`home unreachable: ${e2.message}`);
  }
}

const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
if (!m) {
  bad("could not locate the entry bundle in the home HTML");
} else {
  ok(`entry bundle: ${m[0]}`);
  // Features live in lazily-loaded route chunks, not just the entry, so scan
  // every chunk the pages reference. Reading only the entry produced false
  // "missing" reports for anything behind a route split.
  const chunks = new Set([m[0]]);
  for (const p of ROUTES) {
    try {
      const t = await grab(BASE + p);
      for (const c of t.matchAll(/assets\/[A-Za-z0-9_.\-]+\.js/g)) chunks.add(c[0]);
    } catch {
      /* a route we already report on below */
    }
  }
  let all = "";
  const fetched = new Set();
  try {
    // Route HTML only names the chunks a given page needs. Anything behind a
    // dynamic import (a component the page loads on interaction) is referenced
    // from inside another chunk instead, so follow one level of those too —
    // otherwise markers live in files this scan never opened and every check
    // reports a false "MISSING from live bundle".
    const queue = [...chunks];
    while (queue.length && fetched.size < 400) {
      const c = queue.shift();
      if (fetched.has(c)) continue;
      fetched.add(c);
      const body = await grab(BASE + "/" + c);
      all += body;
      for (const im of body.matchAll(/(?:\.\/)?assets\/([A-Za-z0-9_.\-]+\.js)/g)) {
        const next = "assets/" + im[1];
        if (!fetched.has(next) && !chunks.has(next)) queue.push(next);
      }
      for (const im of body.matchAll(/from\s*"\.\/([A-Za-z0-9_.\-]+\.js)"/g)) {
        const next = "assets/" + im[1];
        if (!fetched.has(next)) queue.push(next);
      }
    }
  } catch (e) {
    bad(`could not fetch bundles: ${e.message}`);
  }
  if (all) {
    ok(`scanned ${fetched.size} chunk(s) reachable from the site HTML`);
    // A partial scan must not be reported as a regression: if nothing loaded,
    // say the scan was incomplete rather than "feature missing".
    if (fetched.size < 5) wrn(`only ${fetched.size} chunk(s) reachable — scan may be incomplete`);
    for (const [name, needle] of BUNDLE_MARKERS) {
      all.includes(needle) ? ok(`shipped: ${name}`) : bad(`MISSING from live bundle: ${name}`);
    }
    for (const [name, needle] of MUST_NOT_SHIP) {
      all.includes(needle) ? bad(`SHIPPED but should not exist: ${name}`) : ok(`removed: ${name}`);
    }
    for (const [name, needle] of FORBIDDEN) {
      all.includes(needle) ? bad(`regressed copy live: ${name}`) : ok(`removed: ${name}`);
    }
  }
}

// ---- 2. Every route renders --------------------------------------
console.log("\n[2/3] routes");
const ERROR_TEXT = /Internal Server Error|Application error|Nothing found|__unhandled/i;
// Sequential, not Promise.all: a 27-request burst was what made connections
// drop in the first place, and the failures looked like broken routes.
const results = [];
for (const p of ROUTES) {
  try {
    const t = await grab(BASE + p);
    results.push({ p, s: 200, err: ERROR_TEXT.test(t) });
  } catch (e2) {
    results.push({ p, s: "ERR", err: true, msg: e2.message });
  }
}
for (const r of results) {
  if (r.err) bad(`${r.p} → ${r.s === 200 ? "error page" : r.s}`);
  else if (r.s !== 200) wrn(`${r.p} → ${r.s}`);
}
if (results.filter((r) => r.err).length === 0)
  ok(`${ROUTES.length} routes served with no error page`);

// ---- 3. Catalog size (the churn driver) --------------------------
console.log("\n[3/3] catalog");
const env = await (async () => {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(".env", "utf8");
    const g = (k) =>
      (raw.split(/\r?\n/).find((l) => l.startsWith(k + "=")) || "")
        .split("=")
        .slice(1)
        .join("=")
        .trim()
        .replace(/^"|"$/g, "");
    return { url: g("VITE_SUPABASE_URL"), key: g("VITE_SUPABASE_PUBLISHABLE_KEY") };
  } catch {
    return {};
  }
})();

if (!env.url || !env.key) {
  wrn("no .env credentials — skipping catalog count");
} else {
  const h = { apikey: env.key, Authorization: `Bearer ${env.key}` };
  const rows = async (table, cols) => {
    try {
      const r = await fetch(`${env.url}/rest/v1/${table}?select=${cols}&limit=500`, { headers: h });
      if (!r.ok) return null;
      const body = await r.json();
      return Array.isArray(body) ? body : [];
    } catch {
      return null;
    }
  };
  const songRows = await rows("songs", "id,title,price,audio_url,cover_url,status");
  const albumRows = await rows("albums", "id,status");
  const artistRows = await rows("artists", "id,status");
  if (songRows === null) {
    wrn("songs table not readable with the anon key");
  } else {
    // The anon key only sees what the public shelves expose, so these are the
    // numbers a LISTENER sees — not total rows. A song still pending approval
    // is invisible here, which is the point: it isn't selling anything yet.
    const detail = (rs) => {
      const out = {};
      for (const r of rs) out[r.status ?? "?"] = (out[r.status ?? "?"] ?? 0) + 1;
      return (
        Object.entries(out)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ") || "none visible"
      );
    };
    console.log(`  INFO  songs:    ${detail(songRows)}`);
    console.log(`  INFO  albums:   ${detail(albumRows ?? [])}`);
    console.log(`  INFO  artists:  ${detail(artistRows ?? [])}`);
    const incomplete = songRows.filter((s) => !s.audio_url || !s.cover_url).length;
    if (incomplete) wrn(`${incomplete} song(s) missing audio_url or cover_url`);

    const songs = songRows.length;
    const albums = (albumRows ?? []).length;
    const artists = (artistRows ?? []).length;
    // Thresholds: a catalog thinner than this cannot beat Spotify on choice,
    // and thin paid-only catalogs lose listeners before they ever convert.
    songs < 50 ? bad(`only ${songs} song(s) — too few to keep anyone`) : ok(`${songs} songs`);
    albums < 5 ? bad(`only ${albums} album(s) — album buying is unusable`) : ok(`${albums} albums`);
    artists < 10 ? wrn(`only ${artists} artist(s)`) : ok(`${artists} artists`);
  }
}

console.log("");
if (warn.length) console.log(`${warn.length} warning(s)\n`);
if (fail.length) {
  console.log(`${fail.length} BLOCKER(S):\n${fail.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log("All launch checks passed.\n");
