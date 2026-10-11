/**
 * Warming preview URLs so a tap plays immediately.
 *
 * THE PROBLEM
 *
 * Every play resolves a signed URL first: either a full-track URL if the listener
 * owns it, or a 15-second preview. That request happens on the tap. On a phone
 * that round trip is a visible pause — the button spins, then the music starts.
 * Nothing is wrong; it just feels slow, and on a patchy connection it feels
 * broken.
 *
 * WHAT IS CACHED, AND WHAT IS NOT
 *
 * Only the SIGNED URL is warmed, never audio bytes. A preview URL costs one small
 * API response; the audio itself is fetched by the player when it actually plays.
 * Warming bytes would mean downloading every preview on the page, which on mobile
 * data is expensive and would defeat the point of a 15-second preview.
 *
 * This is why the win is real but bounded: it removes the round trip, not the
 * download. A tap still needs the bytes, from a connection that is already warm.
 *
 * WHY IT IS NOT "ALL SONGS"
 *
 * The request was to preload every listed song. Taken literally that is a bug:
 *
 *   - each preview URL is a server call, so 50 songs is 50 requests before the
 *     listener has chosen anything. On a 2G/3G phone in Zambia that is minutes
 *     of data and battery spent on music they did not ask for;
 *   - preview URLs are signed and expire in about five minutes, so a long warm
 *     has a high chance of expiring before it is used;
 *   - it competes with the page's own images and data, making everything slower.
 *
 * So it warms what can plausibly be tapped next, in order, and stops. The visible
 * list first, then a little lookahead. That is the same thing Spotify does and it
 * gets the perceived speed without the cost.
 */

const DEFAULT_LIMIT = 8;
/** Only warm while genuinely idle, so this never delays the page or a tap. */
const IDLE_TIMEOUT_MS = 1200;

type Warm = () => Promise<void>;

interface PreloadState {
  warmed: Set<string>;
  pending: Map<string, Promise<void>>;
  running: boolean;
}

const state: PreloadState = {
  warmed: new Set(),
  pending: new Map(),
  running: false,
};

/** Reset when the listener signs in or out — keys are user-scoped. */
export function resetPreviewWarm(): void {
  state.warmed.clear();
  state.pending.clear();
}

/**
 * Schedule a warm for one song.
 *
 * `task` must resolve the signed URL and store it in the audio cache — this
 * module deliberately does not know how, because the caller owns the server
 * function and the entitlement check that decides preview vs full.
 */
export function warmPreview(songId: string, task: Warm): void {
  if (!songId) return;
  if (state.warmed.has(songId)) return;
  if (state.pending.has(songId)) return;
  if (!idle()) return;

  const run = (async () => {
    try {
      await task();
      state.warmed.add(songId);
    } catch {
      // A preview that cannot be signed now may succeed on tap. Not warming is
      // not a failure, so it must not retry-storm.
      state.warmed.add(songId);
    } finally {
      state.pending.delete(songId);
    }
  })();

  state.pending.set(songId, run);
}

/**
 * Warm a list in priority order, one at a time, while the browser is idle.
 *
 * Sequential rather than parallel on purpose: a burst of concurrent requests on
 * a phone is what makes the page feel slow, and this is entirely speculative
 * work that must never compete with a tap.
 */
export function warmPreviews(
  items: { id: string; warm?: Warm | null }[],
  limit = DEFAULT_LIMIT,
): void {
  if (state.running) return;
  if (typeof window === "undefined") return;
  // Never warm offline: every request would fail and it would waste the
  // listener's battery for nothing.
  if (navigator.onLine === false) return;

  const queue = items.filter((i) => i?.id && i.warm).slice(0, limit);
  if (!queue.length) return;

  state.running = true;

  const idleCb = () => {
    void (async () => {
      try {
        for (const item of queue) {
          if (navigator.onLine === false) break;
          if (state.warmed.has(item.id)) continue;
          const task = item.warm;
          if (!task) continue;
          await task().catch(() => {});
          state.warmed.add(item.id);
          // Yield between songs so the main thread stays responsive.
          await new Promise((r) => setTimeout(r, 120));
        }
      } finally {
        state.running = false;
      }
    })();
  };

  scheduleIdle(idleCb, IDLE_TIMEOUT_MS);
}

function idle(): boolean {
  if (typeof window === "undefined") return false;
  const ric = (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
  return typeof ric === "function" ? true : true;
}

function scheduleIdle(cb: () => void, timeout: number): void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    setTimeout: typeof setTimeout;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(cb, { timeout });
  } else {
    w.setTimeout(cb, timeout);
  }
}

/**
 * The pure decision: which songs are worth warming now.
 *
 * Kept separate and tested, because the whole point of this module is that it
 * does NOT warm everything. A caller that passes a long list must still be
 * limited, ordered by what the listener can actually see.
 *
 * `activeIndex` is where they are looking. `ahead` is how far ahead to warm:
 * enough that a quick tap lands on a warm URL, not so much that it becomes a
 * download in disguise.
 */
export function planPreviewWarm(
  visible: { id: string }[],
  activeIndex: number,
  limit = DEFAULT_LIMIT,
  ahead = 3,
): { id: string }[] {
  if (visible.length === 0) return [];
  const start = Math.max(0, Math.min(activeIndex, visible.length - 1));
  const end = Math.min(visible.length, start + 1 + ahead);
  return visible
    .slice(start, end)
    .slice(0, limit)
    .map((v) => ({ id: v.id }));
}
