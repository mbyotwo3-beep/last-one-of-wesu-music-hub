/**
 * A regression gate for the artwork gradient surfaces.
 *
 * The component `CoverArt` is the Spotify treatment: an artwork-derived
 * gradient immediately, the picture fading in over it. These checks assert
 * the surfaces a listener sees most — shelves, rows, the now-playing sheet —
 * actually use it, because the easy failure mode is a refactor putting a bare
 * `StorageImage` back "just for one spot" and that spot being the screen
 * every phone user stares at.
 */
import { readFileSync } from "node:fs";

const has = (file, re) => re.test(readFileSync(file, "utf8"));
const trackCard = has("src/components/discover/TrackCard.tsx", /import \{ CoverArt \}/);
const trackRow = has("src/components/TrackRow.tsx", /import \{ CoverArt \}/);
const songRow = has("src/components/mobile/shared/SongRow.tsx", /import \{ CoverArt \}/);
const nowPlaying = has("src/components/mobile/NowPlayingSheet.tsx", /import \{ CoverArt \}/);

const checks = [
  {
    name: "discover shelf cards"
      + " (the Home/Browse tiles) draw the gradient",
    ok: trackCard,
    why: "these are the first covers a listener sees; a regression here reads as a full redesign loss",
  },
  {
    name: "track rows (desktop lists, library) draw the gradient",
    ok: trackRow,
    why: "the grey square over tint is exactly the flash CoverArt was built to remove",
  },
  {
    name: "mobile song rows draw the gradient",
    ok: songRow,
    why: "these scroll past fast; the fade must survive the quick list builds",
  },
  {
    name: "the now-playing cover draws the gradient",
    ok: nowPlaying,
    why: "the most-viewed cover in the app; its swap happened while nothing moved",
  },
];

let failed = 0;
console.log("  artwork surfaces");
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`    ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` — ${c.why}`}`);
}

if (failed) {
  console.error(`\n  ${failed} artwork guarantee(s) lost — do not ship this`);
  process.exit(1);
}
console.log("  every cover surface carries the artwork gradient");
