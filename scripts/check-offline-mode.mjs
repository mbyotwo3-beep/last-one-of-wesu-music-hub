/**
 * A regression gate for the Offline-mode queue rules.
 *
 * Both of the failures this file exists to catch have already happened once:
 *
 *   1. The player consulted an id index that had not been read yet. Because an
 *      unread index is empty, "empty" was read as "nothing downloaded" and the
 *      queue was wiped — every listener, on the first tap after a cold start.
 *   2. The queue was filtered but the start index was not remapped, so tapping a
 *      track played a different one from the same shelf.
 *
 * A unit test could be deleted or loosened. This reads the SHIPPED source and
 * fails the build if either guard disappears, which is a different kind of
 * guarantee: it survives a well-meaning refactor, because a refactor that drops
 * the guard fails here rather than silently shipping.
 */
import { readFileSync } from "node:fs";

const player = readFileSync("src/stores/player.ts", "utf8");
const queue = readFileSync("src/lib/offline-queue.ts", "utf8");

/**
 * The body of the block that opens with `open`, found by matching braces.
 *
 * WHY NOT A CHARACTER WINDOW
 *
 * This check used to be `if (plan.empty) {` followed by `/return;/` within 400
 * characters. It failed a correct change: extending the error message to name
 * the dropped connection pushed the `return` past the window. The right response
 * to that is NOT to keep the code short enough to satisfy a number — it is to
 * stop measuring a number. A window is a proxy for "does this block return
 * early", and it drifts the moment anyone writes an honest comment in the block.
 *
 * Brace matching measures the property itself, so it is right for every length.
 */
function blockAfter(source, open) {
  const start = source.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const emptyPlanBlock = blockAfter(player, "if (plan.empty) {");

const checks = [
  {
    name: "the player checks the index is ready before filtering on it",
    ok: /isVaultIndexReady\(\)/.test(player),
    why: "without this, an unread (empty) index empties the queue on a cold start",
  },
  {
    name: "the player's queue comes from the plan, not the caller's array",
    ok: /queue:\s*plan\.tracks/.test(player),
    why: "using the unfiltered array would keep unplayable tracks in the queue",
  },
  {
    // Found by the store-level tests. `queue: plan.tracks` was correct while
    // the SELECTION read `tracks[safeIndex]` — so the store held one queue and
    // played a track from another. It only misbehaved once something was
    // actually filtered, which is why the pure-function tests stayed green.
    name: "the selected track is read from the FILTERED array too",
    ok: /plan\.tracks\[safeIndex\]/.test(player) && !/const track = preserveResolvedAudioUrl\(\s*\n?\s*tracks\[safeIndex\]/.test(player),
    why: "selecting from the caller's array plays a track that is not in the queue",
  },
  {
    name: "the shuffle deck is rebuilt from the filtered queue",
    ok: /rebuildShuffleDeck\(state\.shuffle,\s*plan\.tracks\.length/.test(player),
    why: "a deck sized to the old queue draws indexes that no longer exist",
  },
  {
    name: "an empty plan does not clear the current track",
    ok:
      emptyPlanBlock !== null &&
      /return;/.test(emptyPlanBlock) &&
      !/track:\s*null/.test(emptyPlanBlock),
    why: "refusing a new queue must not stop the song already playing",
  },
  {
    name: "the player filters the queue when there is NO CONNECTION, not only under the mode",
    ok: /mustFilterQueue\(\{[\s\S]{0,200}?online:\s*!noConnection/.test(player),
    why:
      "the UI already dims rows when the connection drops; if the player filters " +
      "only under the listener's Offline mode, a correctly dimmed shelf still " +
      "hands the player tracks it cannot fetch, and the shelf silently does not play",
  },
  {
    name: "the two offline states are described differently",
    ok: /if \(modeOn\) return "Offline mode/.test(player) &&
      /if \(noConnection\) return "No connection/.test(player),
    why:
      "same symptom, different owner — under the mode the listener can tap 'Turn off', " +
      "but with the network gone that button fixes nothing and misdirects them",
  },
  {
    name: "add-to-queue refuses a track that is not on the device",
    ok: /addToQueue:[\s\S]{0,600}?getCachedVaultIds\(\)\.has\(track\.id\)/.test(player),
    why: "otherwise a non-downloaded track is appended and dies mid-playback",
  },
  {
    name: "the start index is remapped to the tapped track",
    ok: /findIndex\(\(t\) => t\.id === wanted\.id\)/.test(queue),
    why: "otherwise tapping track 3 plays track 1",
  },
  {
    name: "with the mode off, an empty id set does not filter",
    ok: /if \(!offlineMode\) \{[\s\S]{0,200}?return \{[\s\S]{0,200}?tracks: requested/.test(queue),
    why: "the cold-start regression above, in the pure function",
  },
  {
    name: "the offline switch is persisted outside localStorage as well",
    ok: /document\.cookie/.test(readFileSync("src/stores/offline-mode.ts", "utf8")),
    why: "a WebView with storage blocked would otherwise reset the mode every launch",
  },
];

let failed = 0;
console.log("  offline mode reaches the player");
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`    ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` — ${c.why}`}`);
}

if (failed) {
  console.error(`\n  ${failed} offline-mode guarantee(s) lost — do not ship this`);
  process.exit(1);
}
console.log("  the player only queues what is on the device");
