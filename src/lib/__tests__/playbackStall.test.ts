import { describe, expect, it } from "vitest";

import { stallDecision } from "@/lib/playback-stall";

const live = {
  playing: true,
  paused: false,
  hasRealSrc: true,
  msSinceProgress: 20_000,
  sinceLoadMs: 60_000,
  recoveredOnce: false,
};

describe("mid-play stall: when a dead buffer gets its one silent repair", () => {
  it("recovers a long un-ticking playback", () => {
    expect(stallDecision(live)).toBe("recover");
  });

  it("gives freshly loaded assets the grace window — 3G buffering is not a stall", () => {
    expect(stallDecision({ ...live, sinceLoadMs: 9_999 })).toBe("none");
    expect(stallDecision({ ...live, sinceLoadMs: 15_000 })).toBe("recover");
  });

  it("never repairs around pauses, sources it does not own, or a spent repair", () => {
    expect(stallDecision({ ...live, paused: true })).toBe("none");
    expect(stallDecision({ ...live, hasRealSrc: false })).toBe("none");
    expect(stallDecision({ ...live, recoveredOnce: true })).toBe("none");
  });

  it("short staggers are just buffering, not deadness", () => {
    expect(stallDecision({ ...live, msSinceProgress: 3_000 })).toBe("none");
    expect(stallDecision({ ...live, msSinceProgress: 14_900 })).toBe("none");
  });

  it("a stopped engine owns all of these states", () => {
    expect(stallDecision({ ...live, playing: false })).toBe("none");
  });

  it("recovery fires exactly once per asset — no repair loops", () => {
    // recover → still stalled 20s later → nothing. The listener instead gets
    // the explicit failure UI the error machinery owns; the repair loop is
    // the almost-worse failure this rule exists to prevent.
    const afterRecovery = { ...live, recoveredOnce: true };
    expect(stallDecision(afterRecovery)).toBe("none");
    expect(stallDecision(afterRecovery, { silentMs: 240_000 })).toBe("none");
  });
});
