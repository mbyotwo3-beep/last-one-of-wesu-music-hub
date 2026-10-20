import { describe, expect, it } from "vitest";

import {
  crossfadeOpacity,
  initialCrossfade,
  pruneCrossfade,
  pushCrossfade,
  releaseCrossfade,
} from "@/lib/gradient-crossfade";

const A = "linear-gradient(160deg, hsl(200 50% 40%) 0%, hsl(200 55% 16%) 100%)";
const B = "linear-gradient(160deg, hsl(40 60% 45%) 0%, hsl(40 50% 18%) 100%)";
const C = "linear-gradient(160deg, hsl(300 55% 42%) 0%, hsl(300 50% 15%) 100%)";

describe("marrying two gradients without CSS transitions (state machine)", () => {
  it("mounts the first colour fully visible", () => {
    const s = initialCrossfade(A);
    // The very first paint must be the colour itself: seeding `armed` true
    // instead returned opacity 0 and blanked the sheet until the first song
    // change released it — a real bug this suite exists to keep dead.
    expect(crossfadeOpacity(0, s)).toBe(1);
    expect(s.layers.map((l) => l.css)).toEqual([A]);
    expect(s.armed).toBe(false);
  });

  it("a same-value arrival restarts nothing", () => {
    const s0 = initialCrossfade(A);
    expect(pushCrossfade(s0, A)).toBe(s0);
    // StrictMode double-invokes effects; a re-render with the identical
    // string must not re-arm a fade that is mid-flight.
    expect(pushCrossfade(releaseCrossfade(pushCrossfade(s0, B)), B).armed).toBe(false);
  });

  it("an arrival holds the old colour up while the new waits at zero", () => {
    const s = pushCrossfade(initialCrossfade(A), B);
    expect(s.layers.map((l) => l.css)).toEqual([A, B]);
    expect(s.armed).toBe(true);
    expect(crossfadeOpacity(0, s)).toBe(1); // old holds
    expect(crossfadeOpacity(1, s)).toBe(0); // new waits for its first paint
  });

  it("release moves BOTH layers at once — the cross-fade itself", () => {
    const s = releaseCrossfade(pushCrossfade(initialCrossfade(A), B));
    expect(crossfadeOpacity(0, s)).toBe(0); // old falls
    expect(crossfadeOpacity(1, s)).toBe(1); // new rises
  });

  it("pruning leaves exactly the current colour", () => {
    const s = pruneCrossfade(releaseCrossfade(pushCrossfade(initialCrossfade(A), B)));
    expect(s.layers.map((l) => l.css)).toEqual([B]);
    expect(crossfadeOpacity(1, s)).toBe(1);
    expect(s.armed).toBe(false);
  });

  it("pruning is idempotent", () => {
    const s = initialCrossfade(A);
    expect(pruneCrossfade(pruneCrossfade(s))).toEqual(pruneCrossfade(s));
  });

  it("a rapid third colour converges to one leaving, one current, none stranded", () => {
    // Song skipped fast: A→B then B→C inside the two-frame arm window.
    const s1 = pushCrossfade(initialCrossfade(A), B);
    const s2 = pushCrossfade(s1, C);
    expect(s2.layers.map((l) => l.css)).toEqual([B, C]);
    expect(s2.latestId).toBe(2);
    expect(crossfadeOpacity(1, s2)).toBe(1); // B holds (was mid-blend, snaps to its full moment)
    expect(crossfadeOpacity(2, s2)).toBe(0); // C waits
    const s3 = releaseCrossfade(s2);
    expect(crossfadeOpacity(1, s3)).toBe(0);
    expect(crossfadeOpacity(2, s3)).toBe(1);
  });

  it("never stacks older fades: at most two layers exist after any change", () => {
    let s = initialCrossfade(A);
    for (const css of [B, C, A, B, C]) s = pushCrossfade(s, css);
    expect(s.layers.length).toBe(2);
    expect(pruneCrossfade(s).layers.length).toBe(1);
  });

  it("keeps layer ids strictly increasing after a prune, so keys never collide", () => {
    // A pruned layer must leave its id retired: a new layer reusing id 0
    // would collide in React's reconciliation and could resurrect the old
    // colour's paint.
    const pruned = pruneCrossfade(releaseCrossfade(pushCrossfade(initialCrossfade(A), B)));
    expect(pruned.layers[0].id).toBe(1);
    const again = pushCrossfade(pruned, C);
    expect(again.layers.map((l) => l.id)).toEqual([1, 2]);
  });

  it("prune during the armed window still ends on the current colour, unarmed", () => {
    // Belt-and-braces ordering: the prune timer runs 60ms after the fade
    // should have completed, but a same-tick race with the release chain
    // must still converge — pruning also clears armed.
    const s = pruneCrossfade(pushCrossfade(initialCrossfade(A), B));
    expect(s.layers.map((l) => l.css)).toEqual([B]);
    expect(crossfadeOpacity(1, s)).toBe(1);
    expect(s.armed).toBe(false);
  });
});
