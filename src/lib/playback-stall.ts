/**
 * Mid-play stall watchdog — the rule that decides when a silently dying
 * buffer gets exactly one automatic recovery attempt.
 *
 * WHY THIS EXISTS
 *
 * A mid-song connection drop has two faces. The best case fires the audio
 * element's `error` event and the existing machinery owns it (cache evicted,
 * plain-words error, retry keeps position history). The bad case — common on
 * the 2-3GB Android phones this app targets, and on desktop sagging between
 * tower handoffs — is a buffer that simply stops filling: no error event,
 * no `ended`, the element sits in `stalled`/`waiting` while the spinner
 * spins until the listener gives up. That case had NOTHING before this.
 *
 * THE RULE, HOWEVER, IS DELIBERATELY BLIND TO THAT SAME QUESTION
 *
 * The decision sees only numbers, never which face it is looking at — the
 * noisy `error` case is excluded by `hasRealSrc`-guard + the error listener's
 * own cleanup, and everything else here is time.
 *
 *   - Not playing / real media absent → none. The engine owns these states;
 *     a watchdog acting there would fight the engine's own transitions.
 *   - Paused → none. Pauses are interruptions the app already models
 *     (pause-not-stop); recovering around them re-invents bug 4471.
 *   - Inside the load window → none. Freshly attached assets regularly
 *     buffer longer than the stall threshold on a 3G shop network — the
 *     first 10 seconds are the load, not a stall. The native reconciler
 *     uses the same window.
 *   - Already recovered → none. ONE silent repair per asset. A second
 *     attempt on the same dead buffer would loop (recover → stall → recover)
 *     with the listener stuck in limbo instead of an explicit failure UI.
 *     Anything after the first attempt is the error path's job. Manual
 *     retry (the listener taps play) remains always available — it bumps
 *     the reload key and re-arms a fresh asset.
 *   - 15+ seconds (silentMs) without the position ticking while all of the above hold
 *     → recover. Chosen above every plausible buffering moment: 15s of
 *     un-ticking playback is no longer buffering, the buffer is dead.
 */

export interface StallInputs {
  playing: boolean;
  paused: boolean;
  /** Real media attached — not the silent unlock placeholder, not empty. */
  hasRealSrc: boolean;
  /** Wall-clock ms since the element's currentTime last moved. */
  msSinceProgress: number;
  /** Wall-clock ms since the current asset finished loading (grace window). */
  sinceLoadMs: number;
  /** Whether the single automatic recovery has already been spent. */
  recoveredOnce: boolean;
}

export type StallAction = "recover" | "none";

export function stallDecision(
  i: StallInputs,
  opts: { graceMs?: number; silentMs?: number } = {},
): StallAction {
  const grace = opts.graceMs ?? 10_000;
  const silent = opts.silentMs ?? 15_000;
  if (!i.playing) return "none";
  if (!i.hasRealSrc) return "none";
  if (i.paused) return "none";
  if (i.sinceLoadMs < grace) return "none";
  if (i.recoveredOnce) return "none";
  if (i.msSinceProgress >= silent) return "recover";
  return "none";
}
