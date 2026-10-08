/**
 * Which commit is the live site actually running?
 *
 * Comparing asset filenames between a local build and the live site does NOT
 * work. Vite content-hashes a chunk that imports a dependency by that
 * dependency's hash, so one differing root chunk renames every chunk that
 * reaches it transitively. A whole tree can differ in name while being
 * byte-for-byte the same code. (Measured: 76 of 120 assets "differed" on
 * name while 44 were byte-identical and the rest differed only in the hashes
 * they import.)
 *
 * So this checks for strings that only exist in a specific commit. That is a
 * fact about content, not about build environment.
 *
 * Note: do not assert a marker is ABSENT to prove a fix landed. Both
 * "You need a different account type" and "already exists with that email"
 * legitimately appear in the live bundle — the first is the RoleGate page
 * heading, the second is a key in friendly-error's translation table. Their
 * presence proves nothing either way; only their use as *displayed* text would.
 *
 * Usage: node scripts/whats-live.mjs
 */
const BASE = "https://www.wesuplus.com/";

/** marker -> the commit that introduced it (must be uniquely that commit's). */
const MARKERS = [
  ["Co-lead artist", "997ddb3 co-lead credits"],
  ["made it together", "997ddb3 co-lead credits"],
  ["Editorial Playlists", "208f4f6 admin playlists"],
  ["sheet-swipe-ignore", "90e2a04 mobile swipe fix"],
  ["friendly-error", "90e2a04 friendly auth errors"],
  ["already exists with that email", "90e2a04 friendly auth errors"],
];

const seen = new Set();
const queue = [BASE];
const bodies = new Map();
const failed = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "wesu-launch-check" } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.text();
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

while (queue.length && seen.size < 500) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  const body = await get(url);
  if (body === null) {
    failed.push(url.split("/").pop());
    continue;
  }
  bodies.set(url, body);
  for (const m of body.matchAll(/assets\/[A-Za-z0-9_\-]+\.js/g)) {
    const next = BASE + m[0];
    if (!seen.has(next)) queue.push(next);
  }
}

if (failed.length) {
  console.log(`WARNING: ${failed.length} asset(s) failed to fetch — partial scan\n`);
}

let total = 0;
for (const b of bodies.values()) total += b.length;
console.log(`crawled ${bodies.size} asset(s), ${Math.round(total / 1024)} KB\n`);

const newest = MARKERS[0][1];
for (const [marker, who] of MARKERS) {
  let hit = null;
  for (const [url, body] of bodies) {
    if (body.includes(marker)) {
      hit = url.split("/").pop();
      break;
    }
  }
  console.log(
    `  ${hit ? "PRESENT" : "absent "}  ${marker.padEnd(32)} <- ${who}${hit ? ` (${hit})` : ""}`,
  );
}

const hasNewest = [...bodies.values()].some((b) => b.includes(MARKERS[0][0]));
console.log(
  hasNewest
    ? `\nLive includes ${newest}.`
    : `\nLive does NOT include ${newest} — it is running an older commit.`,
);
