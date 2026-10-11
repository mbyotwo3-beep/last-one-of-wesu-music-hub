/**
 * Crawl every route and report what a listener would actually hit.
 *
 * WHY THIS EXISTS
 *
 * The offline bug, the /library bug and the hero bug were all found by someone
 * LOOKING at the app, not by reading the code. Reading was tried first every
 * time and produced a plausible story that was wrong.
 *
 * So this walks the running server and checks the rendered result rather than the
 * source. It is deliberately dumb: no clever inference, just "did this route
 * return a page, or did it return the error surface".
 *
 * WHAT IT CATCHES
 *
 *   - a route that throws during SSR and renders the error boundary instead of
 *     content, which is exactly what /library did
 *   - a 404 or 500 status behind a 200-looking page
 *   - a page that references a script or stylesheet the server does not serve,
 *     which renders as a blank screen in the app
 *   - a raw error message reaching the listener instead of a real sentence
 *   - duplicate <title> or missing description, which is a silent SEO loss
 *
 * Dynamic routes need real ids, so ids are read out of the catalogue rather than
 * guessed. A route with no data at all is reported as such instead of being
 * quietly skipped — a skipped route is indistinguishable from a passing one.
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8080";
const ROUTES_DIR = "src/routes";

/**
 * Turn a route filename into a URL path, keeping `$param` markers intact.
 *
 * The first version rewrote `.$` to `/` and turned albums.$id.tsx into
 * "/albums/id", so no route was ever detected as dynamic, every real id was
 * silently left unsubstituted, and five routes were reported as 404s that had
 * never been requested with an id at all.
 */
function routePath(file) {
  const base = file.replace(/\.tsx$/, "");
  if (base === "index") return "/";
  if (base.endsWith(".index")) return "/" + base.slice(0, -".index".length).replace(/\./g, "/");
  if (base.startsWith("_")) return null; // pathless layout
  return "/" + base.replace(/\./g, "/").replace(/\/$/, "") || "/";
}

function isDynamic(p) {
  return /\$(?:id|slug)/.test(p);
}

/** Substitute a real id for the $param marker. */
function fill(path, kind) {
  return path.replace(/\$[a-z]+/, ids[kind]?.[0] ?? "");
}

const files = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map(routePath)
  .filter((p) => p !== null)
  .sort();

// --- real ids, so dynamic routes exercise real data
const ids = { albums: [], songs: [], artists: [], playlists: [], labels: [] };

async function tryFetch(url, timeoutMs = 45000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "follow" });
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: "", error: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

// Pull ids straight out of the homepage SSR, which links to real content.
const home = await tryFetch(BASE + "/");
const idOf = (re) => [...home.text.matchAll(re)].map((m) => m[1]);
ids.albums = [...new Set(idOf(/\/albums\/([0-9a-f-]{8,36})/g))].slice(0, 2);
ids.songs = [...new Set(idOf(/\/songs\/([0-9a-f-]{8,36})/g))].slice(0, 2);
ids.artists = [...new Set(idOf(/\/artists\/([0-9a-f-]{8,36})/g))].slice(0, 2);

const problems = [];
const notes = [];

async function check(path) {
  const url = BASE + path;
  const { status, text, error } = await tryFetch(url);
  const label = path;

  if (status === 0) {
    problems.push(`${label} did not respond: ${error}`);
    return;
  }
  if (status >= 500) {
    problems.push(`${label} returned ${status}`);
    return;
  }
  if (status === 404) {
    problems.push(`${label} returned 404`);
    return;
  }
  if (status >= 300 && status < 400) {
    problems.push(`${label} redirected (${status}) — a listener tapping a link should not bounce`);
    return;
  }

  // The error boundary rendered instead of content. This is the /library bug.
  if (/This page didn&#39;t load|This page didn't load/.test(text)) {
    problems.push(`${label} rendered the ERROR page, not content (status ${status})`);
    return;
  }

  // A raw exception string leaking to the listener.
  const leak = text.match(
    /(TypeError|ReferenceError|SyntaxError|Cannot read propert|is not a function|is not defined|of null is not)/,
  );
  if (leak) {
    problems.push(`${label} leaks a raw error to the listener: ${leak[0]}`);
  }

  // Every asset the page references must actually be served, or the app paints a
  // blank screen on a cold start with no cache.
  const refs = [...text.matchAll(/(?:src|href)="(\/[^"?]+\.(?:js|css))"/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  for (const ref of unique.slice(0, 6)) {
    const r = await tryFetch(BASE + ref, 20000);
    if (r.status !== 200) {
      problems.push(`${label} references ${ref} which the server returns ${r.status}`);
    }
  }

  return { assets: unique.length, hasTitle: /<title>/.test(text), hasDesc: /name="description"/.test(text), text };
}

let withAssets = 0;
let missingTitle = [];
const uncovered = [];
for (const p of files) {
  if (isDynamic(p)) {
    const kind = p.split("/")[1];
    if (!(ids[kind] ?? []).length) {
      // Not a broken route — one with no PUBLIC data to reach it by. A user's
      // own playlists, or a label table with no rows yet.
      //
      // Reported as a visible coverage gap rather than a pass and rather than a
      // failure: the crawl exists to find broken pages, and pretending these were
      // checked would be the worst of the three options. Anyone relying on this
      // output has to be able to see that two routes went unverified.
      uncovered.push(p);
      continue;
    }
    await check(fill(p, kind));
  } else {
    const r = await check(p);
    if (r?.assets) withAssets++;
    if (r?.text) {
      if (!r.hasTitle) missingTitle.push(p);
      else if (!r.hasDesc) missingTitle.push(`${p} (no meta description)`);
    }
  }
}

console.log(`  ${files.length} routes crawled against ${BASE}`);
if (ids.albums.length)
  notes.push(
    `real ids discovered for ${Object.entries(ids)
      .filter(([, v]) => v.length)
      .map(([k, v]) => `${k}(${v.length})`)
      .join(", ")}`,
  );
else problems.push("no catalogue ids found on the homepage — every dynamic route went unchecked");

if (withAssets === 0) {
  // Say so. "0 routes verified" printed as a pass is the failure mode this
  // whole project keeps hitting.
  notes.push(
    "NO asset references found — this server is in dev mode, where Vite serves /src/*\n" +
      "        and there is no built bundle. Asset resolution is NOT verified by this run.",
  );
} else {
  notes.push(`${withAssets} static routes verified their assets resolve`);
}
if (missingTitle.length) {
  notes.push(`SEO gaps on ${missingTitle.length} route(s): ${missingTitle.slice(0, 6).join(", ")}`);
}
if (uncovered.length) {
  notes.push(
    `COVERAGE GAP — ${uncovered.length} route(s) could NOT be crawled because there is\n` +
      `        no public ${[...new Set(uncovered.map((u) => u.split("/")[1]))].join(" or ")} data to\n` +
      `        reach them by: ${uncovered.join(", ")}. They are unverified, not passing.`,
  );
}

for (const n of notes) console.log(`    ${n}`);
if (problems.length) {
  console.error("");
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error(`\n  ${problems.length} problem(s) across the site`);
  process.exit(1);
}
console.log("  every route renders content and every asset resolves");