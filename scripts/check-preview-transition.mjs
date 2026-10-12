/**
 * Does a tapped song start without silence?
 *
 * THE DEFECT THIS WAS WRITTEN FOR
 *
 * PlayerBar resolves a signed preview URL before every play, and it clears the
 * audio element FIRST:
 *
 *     audio.pause(); audio.removeAttribute("src"); audio.load();
 *     await isTrackDownloaded(...)
 *     await getPreviewFn(...)
 *     audio.src = url; audio.play()
 *
 * The element is emptied before the round trip, so there is silence for the whole
 * of it. On a good connection that reads as a hitch; on metered mobile data it
 * is seconds. The report was "moving from one song to another is not smooth".
 *
 * WHY THE EXISTING WARM DID NOT COVER IT
 *
 * PlayerBar pre-signs queue[next] — the next track in order, only while playing,
 * only when the queue has 2+ entries. That helps auto-advance and Next. It does
 * nothing for tapping a DIFFERENT song from a list, which is the common case.
 *
 * usePreviewWarm warms a whole visible list and was wired into /albums/$id only.
 * Home, Browse, Search, Library, Playlists and Liked Songs had nothing.
 *
 * THE RULE
 *
 * Every song-tapping surface must warm the song on INTENT — pointerdown and
 * focus, not hover alone, because there is no hover on a phone. Warming the whole
 * list is explicitly NOT the fix: a request per visible row is the data cost this
 * feature exists to avoid.
 */
import { readFileSync, existsSync } from "node:fs";

const problems = [];
const notes = [];

/** The surfaces a listener actually taps to start a song. */
const SURFACES = [
  { file: "src/components/TrackRow.tsx", name: "TrackRow (desktop row)" },
  { file: "src/components/mobile/shared/SongRow.tsx", name: "SongRow (mobile row)" },
  { file: "src/components/discover/TrackCard.tsx", name: "TrackCard (grid card)" },
];

const HOOK = "src/hooks/use-intent-warm.ts";

if (!existsSync(HOOK)) {
  problems.push(`${HOOK} is missing — nothing warms a tapped song`);
} else {
  const hook = readFileSync(HOOK, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  if (!/getPreviewAudioUrl/.test(hook)) {
    problems.push(
      "use-intent-warm never resolves a preview URL — the warm would be a no-op",
    );
  }
  // Matched on a CALL, not the name. The name appears in the import line, so a
  // check for the bare word stayed green after the only write was deleted — the
  // tenth time a check has been satisfied by something other than the behaviour.
  if (!/setCachedAudioUrl\s*\(/.test(hook)) {
    problems.push(
      "use-intent-warm never writes the cache PlayerBar reads — a warm that is not\n" +
        "        stored changes nothing about the transition",
    );
  }
  if (!/Number\(price.*\)\s*<=\s*0/.test(hook)) {
    problems.push(
      "use-intent-warm does not skip free songs — a preview URL caps them at 15\n" +
        "        seconds and mislabels them in the UI",
    );
  }
  if (!/navigator\.onLine\s*===\s*false/.test(hook)) {
    problems.push("use-intent-warm does not check connectivity before spending a request");
  }
  // A failed warm must be swallowed: the tap still resolves, just slowly.
  if (!/catch\s*\{/.test(hook)) {
    problems.push(
      "use-intent-warm has no catch — a failed warm would surface as an unhandled\n" +
        "        rejection during a tap",
    );
  }
  if (problems.length === 0) {
    notes.push("the warm resolves, caches, skips free songs and swallows failures");
  }
}

for (const s of SURFACES) {
  if (!existsSync(s.file)) {
    problems.push(`${s.file} is missing`);
    continue;
  }
  const src = readFileSync(s.file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const warms = /useIntentWarm/.test(src);
  const onIntent = /onPointerDown=\{\s*warm/.test(src) && /onFocus=\{\s*warm/.test(src);

  if (!warms) {
    problems.push(
      `${s.name} (${s.file}) does not warm the song it starts.\n` +
        "        Every play resolves a signed URL while the audio element has\n" +
        "        already been cleared, so an unwarmed tap is silence for the whole\n" +
        "        round trip.",
    );
  } else if (!onIntent) {
    problems.push(
      `${s.name} warms on the wrong signal — it needs BOTH onPointerDown and onFocus.\n` +
        "        Hover alone does nothing on a touch screen, which is where most\n" +
        "        listeners are.",
    );
  } else {
    notes.push(`${s.name} warms on tap intent`);
  }
}

// The gap itself must still be there, or this rule is stale.
//
// Both sides are scoped to their own function. The first version searched the
// whole file for `audio.removeAttribute("src")` and for `getPreviewFn`, which
// land in completely unrelated places — the clear appears in exitSong too, and
// the first getPreviewFn is in the next-track WARM effect, hundreds of lines
// earlier. That made the rule report "PlayerBar resolves before clearing the
// element", the opposite of the truth, while passing.
//
// Same family as every other weak check in this project: a comparison that finds
// the right two words in the wrong two places.
const bar = "src/components/PlayerBar.tsx";
if (existsSync(bar)) {
  const src = readFileSync(bar, "utf8");

  // The selection-change effect: starts at the ref stamp, ends at its close.
  const effectStart = src.indexOf("currentSelectionRef.current = selectionId;");
  const effectBody =
    effectStart === -1 ? "" : src.slice(effectStart, src.indexOf("\n  }, [", effectStart));

  // The resolver, scoped to loadUrl.
  const loadStart = src.indexOf("async function loadUrl()");
  const loadBody =
    loadStart === -1 ? "" : src.slice(loadStart, src.indexOf("\n    async function", loadStart + 10));

  const clearAt = effectBody.indexOf('audio.removeAttribute("src")');
  const resolveAt = loadBody.search(/getPreviewFn|getSignedFn/);

  if (clearAt === -1) {
    problems.push(
      "PlayerBar no longer clears the audio element before loading — if that was\n" +
        "        fixed at the source, the intent warm below is no longer the reason\n" +
        "        for this rule and the rule should be reconsidered",
    );
  } else if (resolveAt === -1) {
    problems.push("PlayerBar no longer resolves a URL in loadUrl — re-check this rule");
  } else if (resolveAt < clearAt) {
    problems.push(
      "PlayerBar now resolves the new URL BEFORE clearing the element. That is a\n" +
        "        real improvement and makes the intent warm redundant — but it would\n" +
        "        reintroduce the 'plays the previous song first' bug this ordering was\n" +
        "        chosen to avoid. Confirm it before accepting this state.",
    );
  } else {
    notes.push(
      "PlayerBar clears the element before resolving, so the gap is real and warming\n" +
        "        on intent is the fix (warming whole lists would cost data)",
    );
  }
}

console.log("  a tapped song starts without silence");
for (const n of notes) console.log(`    ${n}`);
if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error("\n  moving between songs starts from silence");
  process.exit(1);
}