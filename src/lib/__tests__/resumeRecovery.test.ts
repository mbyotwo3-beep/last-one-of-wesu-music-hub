import { describe, expect, it } from "vitest";

import {
  errorClass,
  recoveryDecision,
  resumeRefreshDecision,
} from "@/lib/resume-recovery";

describe("resuming from background: what a route error means there", () => {
  it("recognises the deploy-skew import death", () => {
    expect(
      errorClass(
        new TypeError(
          "Failed to fetch dynamically imported module: https://www.wesuplus.com/assets/browse-B7xY.js",
        ),
      ),
    ).toBe("stale-chunk");
    expect(errorClass(new Error("Failed to load module script: Expected a JavaScript module"))).toBe(
      "stale-chunk",
    );
  });

  it("recognises a dead token from the auth middleware's own words", () => {
    expect(errorClass(new Error("Unauthorized: Invalid token"))).toBe("auth");
    expect(errorClass(new Error("Unauthorized: No authorization header provided"))).toBe("auth");
    expect(errorClass(new Error("JWT expired"))).toBe("auth");
  });

  it("recognises an aborted resume request without putting it in the offline box", () => {
    const aborted = new DOMException("The user aborted a request.", "AbortError");
    expect(errorClass(aborted)).toBe("aborted");
  });

  it("falls through network- and timeout-class failures untouched", () => {
    expect(errorClass(new Error("Request timed out"))).toBe("network");
    expect(errorClass(new Error("getFeaturedAlbums: Internal Server Error"))).toBe("other");
  });
});

describe("the one silent attempt per kind per window", () => {
  const fresh = { guard: {}, nowMs: 5_000_000_000 };

  it("reloads a stale chunk once", () => {
    const err = new TypeError("Failed to fetch dynamically imported module: /assets/x.js");
    expect(recoveryDecision({ ...fresh, error: err, offline: false })).toBe("reload");
  });

  it("does NOT reload when this device already tried within the window", () => {
    const err = new TypeError("Failed to fetch dynamically imported module: /assets/x.js");
    expect(
      recoveryDecision({ ...fresh, error: err, offline: false, guard: { reload: fresh.nowMs } }),
    ).toBe("none");
    // ...but a NEW fault much later may heal again
    expect(
      recoveryDecision({
        error: err,
        offline: false,
        guard: { reload: fresh.nowMs - 61_000 },
        nowMs: fresh.nowMs,
      }),
    ).toBe("reload");
  });

  it("refreshes auth once — refresh again waits out the window", () => {
    const err = new Error("Unauthorized: Invalid token");
    expect(recoveryDecision({ ...fresh, error: err, offline: false })).toBe("reauth");
    expect(
      recoveryDecision({ ...fresh, error: err, offline: false, guard: { reauth: fresh.nowMs } }),
    ).toBe("none");
  });

  it("revalidates aborted requests once — a deliberate cancel is not healed twice", () => {
    const err = new DOMException("The user aborted a request.", "AbortError");
    expect(recoveryDecision({ ...fresh, error: err, offline: false })).toBe("revalidate");
    expect(
      recoveryDecision({
        ...fresh,
        error: err,
        offline: false,
        guard: { revalidate: fresh.nowMs - 10_000 },
      }),
    ).toBe("none");
    expect(
      recoveryDecision({
        error: err,
        offline: false,
        guard: { revalidate: fresh.nowMs - 46_000 },
        nowMs: fresh.nowMs,
      }),
    ).toBe("revalidate");
  });

  it("never acts offline — the offline notice owns that state", () => {
    const cases = [
      new TypeError("Failed to fetch dynamically imported module: /assets/x.js"),
      new Error("Unauthorized: Invalid token"),
      new DOMException("aborted", "AbortError"),
    ];
    for (const err of cases) {
      expect(recoveryDecision({ ...fresh, error: err, offline: true })).toBe("none");
    }
  });

  it("unknown faults stay honest — no automatic healing of what we cannot name", () => {
    expect(
      recoveryDecision({ ...fresh, error: new Error("getFeaturedAlbums: boom"), offline: false }),
    ).toBe("none");
  });
});

describe("proactive resume refresh: the stopwatch, not the token clock", () => {
  it("skips tab flicks and offline resumes", () => {
    expect(resumeRefreshDecision({ hiddenForMs: 30_000, online: true })).toBe("skip");
    expect(resumeRefreshDecision({ hiddenForMs: 600_000, online: false })).toBe("skip");
  });

  it("refreshes when the device truly slept", () => {
    expect(resumeRefreshDecision({ hiddenForMs: 181_000, online: true })).toBe("refresh");
  });
});
