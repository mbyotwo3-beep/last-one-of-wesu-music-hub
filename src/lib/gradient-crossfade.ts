/**
 * The cross-fade state machine behind GradientFader.
 *
 * WHY A PURE MODULE AND NOT LOGIC INSIDE THE COMPONENT
 *
 * CSS does not animate gradients (image functions are not interpolatable),
 * so the only true cross-fade is layered photography: old colour stays
 * painted, new colour mounts on top at opacity 0, then both transition —
 * old out, new in — before the old layer is pruned. That choreography is a
 * small state machine with three transitions (arrive, release, prune) and
 * it had two real bugs on first write (a seeded-armed blank mount, and a
 * fade that could strand armed when a colour changed within the two-frame
 * window). Both failures are state transitions, not rendering — and state
 * transitions can be proven here, in node, where every suite in this
 * project runs.
 *
 * The component is deliberately a thin shell: effects wiring these calls to
 * rAF and a timeout, and a render function reading `crossfadeOpacity`.
 *
 * TERMINOLOGY
 *
 *   arrived  — a new colour mounted on top at opacity 0; the cross-fade is
 *              holding until two frames pass (so the browser cannot
 *              coalesce the two opacity states into one paint)
 *   released — the old layer is falling 1→0 while the new rises 0→1
 *   pruned   — leaving layers dropped; only the current colour remains
 */

export interface CrossfadeLayer {
  id: number;
  css: string;
}

export interface CrossfadeState {
  layers: CrossfadeLayer[];
  /** The layer that is on screen (or, while armed, about to be). */
  latestId: number;
  /** The background value that produced `latestId` — same-value no-ops. */
  latestCss: string;
  /** True from arrival until release; while armed the new layer paints 0. */
  armed: boolean;
}

export function initialCrossfade(css: string): CrossfadeState {
  return {
    layers: [{ id: 0, css }],
    latestId: 0,
    latestCss: css,
    armed: false,
  };
}

/**
 * Mount a new colour on top. Same-value arrivals are no-ops — a parent
 * re-rendering with the identical string (or React StrictMode's double
 * effect) must not restart a fade that is mid-flight.
 */
export function pushCrossfade(state: CrossfadeState, css: string): CrossfadeState {
  if (state.latestCss === css) return state;
  return {
    // Only the PREVIOUS latest survives as the leaving layer. Anything
    // older was mid-fade at opacity <1 and cannot participate sensibly in
    // a three-colour blend; dropping it snaps its share of the screen to
    // the arriving blend point, which is the bounded, honest degradation
    // and keeps every moment to at most two layers.
    layers: [
      ...state.layers.filter((l) => l.id === state.latestId),
      { id: state.latestId + 1, css },
    ],
    latestId: state.latestId + 1,
    latestCss: css,
    armed: true,
  };
}

export function releaseCrossfade(state: CrossfadeState): CrossfadeState {
  return { ...state, armed: false };
}

/** Drop everything except the current layer, so fades never stack. */
export function pruneCrossfade(state: CrossfadeState): CrossfadeState {
  return {
    ...state,
    layers: state.layers.filter((l) => l.id === state.latestId),
    armed: false,
  };
}

/** Render decision for one layer: the opacity it paints at right now. */
export function crossfadeOpacity(layerId: number, state: CrossfadeState): number {
  const isLatest = layerId === state.latestId;
  // While armed, the NEW layer holds at 0 (it has just painted) and the OLD
  // holds at 1. Released, both move toward their final values — old out,
  // new in — simultaneously, which is what makes this a cross-fade rather
  // than a wipe.
  return isLatest ? (state.armed ? 0 : 1) : state.armed ? 1 : 0;
}
