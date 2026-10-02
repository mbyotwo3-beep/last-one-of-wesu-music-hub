/**
 * Which track plays next — the rule lives here, pure, so the shuffle and
 * repeat behaviour can be tested without a store or an audio element.
 *
 * The bug this replaces: shuffle picked `Math.floor(Math.random() * length)`
 * on EVERY skip. That could return the index already playing, so the listener
 * heard a no-op "skip", and it could return the same track repeatedly, so
 * shuffle never made progress and the visible queue order never matched what
 * played. Shuffle now draws without replacement from the tracks it has not
 * played yet, and the order is stored so the UI can show it.
 */

export type RepeatMode = "off" | "all" | "one";

/** One entry of the shuffle deck: the queue positions still to play. */
export interface ShuffleDeck {
  /** Remaining queue positions, in the order they will be played. */
  order: number[];
  /** How many have been consumed from the front. */
  cursor: number;
  /** The position currently playing, excluded from the remaining order. */
  current: number | null;
}

/** A deck of every position except the one already playing. */
export function buildShuffleDeck(queueLength: number, current: number | null): ShuffleDeck {
  const all: number[] = [];
  for (let i = 0; i < queueLength; i++) if (i !== current) all.push(i);
  return { order: shuffled(all), cursor: 0, current };
}

/** Fisher-Yates on a copy; the input is never mutated. */
function shuffled(items: number[]): number[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Next queue position, or null when playback should stop.
 *
 *   shuffle on  → take the next unused position from the deck. When the deck
 *                 runs dry: with repeat "all" start a fresh deck, otherwise
 *                 stop.
 *   shuffle off → the next position, wrapping only when repeat is "all".
 */
export function pickNextIndex(state: {
  queueLength: number;
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  deck: ShuffleDeck | null;
}): { index: number | null; deck: ShuffleDeck | null } {
  const { queueLength, queueIndex, shuffle, repeat } = state;
  if (queueLength <= 0) return { index: null, deck: state.deck };

  if (!shuffle) {
    const next = queueIndex + 1;
    if (next < queueLength) return { index: next, deck: state.deck };
    if (repeat === "all") return { index: 0, deck: state.deck };
    return { index: null, deck: state.deck };
  }

  const deck = state.deck ?? buildShuffleDeck(queueLength, queueIndex);
  if (deck.cursor < deck.order.length) {
    const index = deck.order[deck.cursor];
    return {
      index,
      // Keep the track that is now playing out of the remaining order.
      deck: { ...deck, cursor: deck.cursor + 1, current: index },
    };
  }
  // Every track has been played once.
  if (repeat === "all") {
    const fresh = buildShuffleDeck(queueLength, queueIndex);
    if (fresh.order.length === 0) return { index: null, deck: fresh };
    return { index: fresh.order[0], deck: { ...fresh, cursor: 1, current: fresh.order[0] } };
  }
  return { index: null, deck };
}

/**
 * Where "play next" inserts. Always directly after the current track, so the
 * listener hears it next rather than at the end of the queue.
 */
export function insertIndexForPlayNext(queueLength: number, queueIndex: number): number {
  return Math.min(queueLength, queueIndex + 1);
}
