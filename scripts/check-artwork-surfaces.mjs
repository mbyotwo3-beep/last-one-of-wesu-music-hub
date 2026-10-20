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

// The ambient-room work: the sheet derives its colour from the artwork
// through the gradient hook and cross-fades it (GradientFader, because CSS
// cannot transition gradients), and the Skeleton set sweeps rather than
// blinks.
const sheet = readFileSync("src/components/mobile/NowPlayingSheet.tsx", "utf8");
const skeleton = readFileSync("src/components/Skeleton.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

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
  {
    name: "the now-playing room colour comes from the artwork, cross-faded",
    ok:
      /useArtworkGradient\("album-art", track\?\.coverUrl\)/.test(sheet) &&
      /GradientFader/.test(sheet) &&
      !/1a1a2e/.test(sheet),
    why:
      "one hardcoded blue for every song is the pre-Spotify look the ambient " +
      "work exists to replace; a revert must fail this build",
  },
  {
    name: "the ambient glow sits behind the controls",
    ok: /absolute inset-0 -z-10 pointer-events-none/.test(sheet) && /isolation:\s*"isolate"/.test(sheet),
    why:
      "without the isolated negative layer the glow either paints over the " +
      "transport buttons or steals their taps",
  },
  {
    name: "loading skeletons sweep, not blink",
    ok: !/animate-pulse/.test(skeleton) && /wesu-shimmer/.test(skeleton) && /wesu-shimmer/.test(styles),
    why:
      "the sweep is the loading language this design chose; a leftover pulse " +
      "half-swept is the inconsistency the utility was written to erase",
  },
  {
    name: "the shimmer sweep respects reduced motion",
    ok: /@media \(prefers-reduced-motion: no-preference\) \{\s*\.wesu-shimmer::after \{/.test(
      styles.replace(/\r\n/g, "\n"),
    ),
    why: "a listener who turned animations off gets the flat block, not an infinite sweep",
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
console.log("  the now-playing room breathes the artwork's colour");
