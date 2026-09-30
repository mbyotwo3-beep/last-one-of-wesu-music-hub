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
const BASE = process.env.SMOKE_BASE ?? "https://www.wesuplusly.com";

const ROUTES = [
  "/", "/artists", "/albums", "/hot-tracks", "/new-music", "/must-have",
  "/browse", "/search?q=test", "/library", "/downloads", "/queue",
  "/liked-songs", "/playlists", "/notifications", "/profile", "/get-app",
  "/contact", "/become-artist", "/auth", "/checkout", "/checkout/success",
  "/privacy", "/terms", "/terms-listener", "/terms-artist", "/labels",
];

// Feature strings that must exist in the live entry bundle. Each is a fix we
// shipped and can silently lose on redeploy.
const BUNDLE_MARKERS = [
  ["offline snapshot cache", "wesu:snap:"],
  ["notification permission ask", "wesu:notif-asked"],
  ["battery optimisation nudge", "Keep music playing when the screen is off"],
  ["public downloads route", "My downloads"],
];

// Copy that must NOT come back (a removed feature).
const FORBIDDEN = [["subscription tiers", "Free & Premium tiers"]];

const fail = [];
const warn = [];
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { fail.push(m); console.log(`  FAIL  ${m}`); };
const wrn = (m) => { warn.push(m); console.log(`  WARN  ${m}`); };

console.log(`\nWesu+ launch check — ${BASE}\n`);

// ---- 1. Deployed bundle is current -------------------------------
console.log("[1/3] deployed bundle");
let html = "";
try {
  const r = await fetch(BASE + "/", { redirect: "follow" });
  html = await r.text();
  if (r.status === 200) ok("home responds 200");
  else bad(`home responded ${r.status}`);
} catch (e) {
  bad(`home unreachable: ${e.message}`);
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
  for (const p of ["/", "/artists", "/albums", "/library", "/downloads", "/hot-tracks"]) {
    try {
      const t = await (await fetch(BASE + p, { redirect: "follow" })).text();
      for (const c of t.matchAll(/assets\/[A-Za-z0-9_.\-]+\.js/g)) chunks.add(c[0]);
    } catch { /* a route we already report on below */ }
  }
  let all = "";
  try {
    for (const c of chunks) {
      all += await (await fetch(BASE + "/" + c)).text();
    }
  } catch (e) {
    bad(`could not fetch bundles: ${e.message}`);
  }
  if (all) {
    ok(`scanned ${chunks.size} chunk(s)`);
    for (const [name, needle] of BUNDLE_MARKERS) {
      all.includes(needle) ? ok(`shipped: ${name}`) : bad(`MISSING from live bundle: ${name}`);
    }
    for (const [name, needle] of FORBIDDEN) {
      all.includes(needle) ? bad(`regressed copy live: ${name}`) : ok(`removed: ${name}`);
    }
  }
}

// ---- 2. Every route renders --------------------------------------
console.log("\n[2/3] routes");
const ERROR_TEXT = /Internal Server Error|Application error|Nothing found|__unhandled/i;
const results = await Promise.all(
  ROUTES.map(async (p) => {
    try {
      const r = await fetch(BASE + p, { redirect: "follow" });
      const t = await r.text();
      return { p, s: r.status, err: ERROR_TEXT.test(t) };
    } catch (e) {
      return { p, s: "ERR", err: true, msg: e.message };
    }
  }),
);
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
        .split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
    return { url: g("VITE_SUPABASE_URL"), key: g("VITE_SUPABASE_PUBLISHABLE_KEY") };
  } catch { return {}; }
})();

if (!env.url || !env.key) {
  wrn("no .env credentials — skipping catalog count");
} else {
  const h = { apikey: env.key, Authorization: `Bearer ${env.key}` };
  const count = async (table, cols) => {
    try {
      const r = await fetch(`${env.url}/rest/v1/${table}?select=${cols}&limit=500`, { headers: h });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) ? rows.length : 0;
    } catch { return null; }
  };
  const songs = await count("songs", "id,title,price,audio_url,cover_url,status");
  const albums = await count("albums", "id,status");
  const artists = await count("artists", "id,status");
  if (songs === null) wrn("songs table not readable with the anon key");
  else {
    // Thresholds: a catalog thinner than this cannot beat Spotify on choice,
    // and thin paid-only catalogs lose listeners before they ever convert.
    songs < 50 ? bad(`only ${songs} song(s) — too few to keep anyone`) : ok(`${songs} songs`);
    (albums ?? 0) < 5 ? bad(`only ${albums ?? 0} album(s) — album buying is unusable`) : ok(`${albums} albums`);
    (artists ?? 0) < 10 ? wrn(`only ${artists ?? 0} artist(s)`) : ok(`${artists} artists`);
  }
}

console.log("");
if (warn.length) console.log(`${warn.length} warning(s)\n`);
if (fail.length) {
  console.log(`${fail.length} BLOCKER(S):\n${fail.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log("All launch checks passed.\n");
