/**
 * Show what the route smoke test actually matched.
 *
 * The first version flagged any page whose HTML contained /error|exception/i
 * within the first 4000 characters. That matches `friendlyError`, `error: null`,
 * bundled error-handling code and the word "error" in ordinary copy — 12 of 27
 * routes "failed" for that reason, which is a broken check, not broken pages.
 *
 * A check that cries wolf gets ignored, so this prints the matching context for
 * each hit and distinguishes an actual rendered error page from an incidental
 * substring in the JavaScript payload.
 *
 * Usage: node scripts/e2e-routes-detail.mjs [route ...]
 */
const SITE = "https://www.wesuplus.com";
const DEFAULT_ROUTES = [
  "/",
  "/browse",
  "/songs",
  "/albums",
  "/artists",
  "/labels",
  "/new-music",
  "/hot-tracks",
  "/must-have",
  "/recently-added",
  "/playlists",
  "/contact",
  "/become-artist",
  "/apply-label",
  "/library",
  "/dashboard",
  "/downloads",
];

const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;

/** Phrases that only appear when a page genuinely failed to render. */
const REAL_ERRORS = [
  /Something went wrong/i,
  /Unexpected Error/i,
  /Internal Server Error/i,
  /Application error/i,
  /cannot read properties of (undefined|null)/i,
  /is not a function/i,
  /Maximum update depth exceeded/i,
  /Minified React error #[0-9]+/i,
];

/** Benign: error-handling identifiers and empty fields in the JS payload. */
const BENIGN = [
  /friendlyError/i,
  /errorCode/i,
  /"error":null/i,
  /error:\s*null/i,
  /errorMessage/i,
  /ErrorBoundary/i,
  /onError/i,
  /useError/i,
  /RouteError/i,
  /catch\s*\(/,
  /playbackError/i,
  /routeErrorComponent/i,
];

for (const r of routes) {
  const res = await fetch(SITE + r, { redirect: "follow" });
  const html = await res.text();

  const real = REAL_ERRORS.filter((re) => re.test(html));
  const incidental = [];
  const words = html.match(/.{60}(error|exception).{60}/gi) ?? [];
  for (const w of words.slice(0, 40)) {
    if (BENIGN.some((b) => b.test(w))) incidental.push(w.trim());
    else if (!real.some((re) => re.test(w))) incidental.push(w.trim());
  }

  const verdict = real.length ? "REAL ERROR" : incidental.length ? "incidental match" : "clean";
  console.log(`\n${r}  HTTP ${res.status}  -> ${verdict}`);
  if (real.length) {
    for (const re of real) {
      const m = html.match(re);
      console.log(
        `   !! ${re} :: ${JSON.stringify(html.slice(Math.max(0, m.index - 120), m.index + 160))}`,
      );
    }
  } else if (incidental.length) {
    for (const s of incidental.slice(0, 3)) console.log(`   .. ${JSON.stringify(s.slice(0, 130))}`);
  }
}
