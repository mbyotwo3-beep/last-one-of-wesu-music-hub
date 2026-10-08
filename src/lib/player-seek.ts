/**
 * Progress-bar seek maths, extracted so it can be tested.
 *
 * This lived inline in PlayerBar's `seek` handler. playerLogic.test.ts tested a
 * COPY of it — its own `computeSeekTime` and `togglePlay` — so it asserted that
 * a re-implementation agreed with itself and could not fail when the shipped
 * component broke. A test that cannot fail is decoration.
 *
 * Extracted here so the test binds to the code that actually runs.
 */

/** Clamp a pointer position to a 0..1 position along the bar. */
export function seekFraction(clickX: number, barLeft: number, barWidth: number): number {
  // A zero-width bar would divide by zero, yielding NaN or Infinity, and NaN
  // propagates straight into seekTo() and out to the audio element's currentTime.
  if (!Number.isFinite(barWidth) || barWidth <= 0) return 0;
  const pct = (clickX - barLeft) / barWidth;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(1, pct));
}

/**
 * Seconds to seek to.
 *
 * A preview has its own shorter ceiling: tapping at the far right of the bar for
 * a 15-second preview must land on 15s, not the full track duration.
 */
export function computeSeekTime(
  clickX: number,
  barLeft: number,
  barWidth: number,
  durationSeconds: number,
  isPreview = false,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const target = isPreview ? 15 : durationSeconds;
  return seekFraction(clickX, barLeft, barWidth) * target;
}
