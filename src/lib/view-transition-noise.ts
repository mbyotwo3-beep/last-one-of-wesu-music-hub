/**
 * Chrome's View Transition API DOMException, filtered at the console's edge.
 *
 * WHAT THIS SUPPRESSES — and why it is deliberately narrow
 *
 * Since `defaultViewTransition: true`, every route change asks the platform to
 * cross-fade. Chromium can legitimately SKIP that transition:
 *
 *   - the document is hidden (background tab, phone app switched away mid-fade);
 *   - a NEW transition starts and aborts the old one (fast tappers);
 *   - the viewport changes mid-fade.
 *
 * In every one of those cases the navigation itself commits and the page
 * renders — nothing is broken. The router's transition lifecycle promises
 * (ready/finished) still have no rejection handlers upstream
 * (TanStack/router#7906), so the skip surfaces as an unhandled rejection:
 * `InvalidStateError: Transition was aborted because of invalid state`.
 *
 * react-dom already ignores exactly this exception inside
 * startViewTransition (ReactFiberConfigDOM suppresses by message); the router
 * just hasn't caught up. The filter does for the app what react-dom does
 * globally — but ONLY for this exception:
 *
 *   - recovered by recovery decision: it must be a DOMException-shaped reason
 *     named InvalidStateError whose message starts with Chromium's phrase
 *     (Chrome 153+ appends a skip-reason suffix to the phrase, so the match is
 *     a PREFIX, not an equality — react-dom's equality got bitten by that,
 *     react#37669);
 *
 * Everything else — real failures, app errors, network rejections — passes
 * through untouched and still reaches the console and any reporter.
 */
export function isBenignViewTransitionSkip(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const r = reason as { name?: unknown; message?: unknown };
  if (r.name !== "InvalidStateError") return false;
  if (typeof r.message !== "string") return false;
  return r.message.startsWith("Transition was aborted because of invalid state");
}

/** Idempotent install marker — the entry point can be evaluated twice. */
const MARKER = "__wesuViewTransitionNoiseFilter";

export function installViewTransitionNoiseFilter(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[MARKER]) return;
  w[MARKER] = true;
  window.addEventListener("unhandledrejection", (event) => {
    if (isBenignViewTransitionSkip(event.reason)) {
      // The navigation committed fine; a skipped fade is expected behavior, so
      // keeping it out of the console keeps real errors readable there.
      event.preventDefault();
    }
  });
}
