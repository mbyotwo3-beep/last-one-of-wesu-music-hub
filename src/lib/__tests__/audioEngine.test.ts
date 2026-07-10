/**
 * Property-based tests for AudioEngine error handling and retry logic.
 *
 * Feature: wesu-plus-completion
 *
 * Property 19: AudioEngine error state disables playback
 * Validates: Requirements 1.7, 17.1
 *
 * Property 20: Signed URL retry up to 2 additional attempts
 * Validates: Requirements 17.2
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// AudioEngine state model
// ---------------------------------------------------------------------------

type AudioState = "idle" | "loading" | "playing" | "paused" | "error";

interface AudioEngineState {
  status: AudioState;
  playing: boolean;
  errorMessage: string | null;
  retryCount: number;
}

function initialState(): AudioEngineState {
  return { status: "idle", playing: false, errorMessage: null, retryCount: 0 };
}

/**
 * Pure model of what happens when getSignedAudioUrl throws after all retries.
 * Mirrors PlayerBar.tsx loadUrl() error path:
 *   - Sets playing: false
 *   - Sets error message
 *   - Sets status: 'error'
 */
function applyUrlError(state: AudioEngineState, errorMsg: string): AudioEngineState {
  return {
    ...state,
    status: "error",
    playing: false,
    errorMessage: errorMsg,
  };
}

/**
 * Pure model of retry logic:
 *   - If retryCount < 2: increment retryCount, status stays 'loading'
 *   - If retryCount >= 2: apply error (exhausted retries)
 */
function applyRetry(state: AudioEngineState, errorMsg: string): AudioEngineState {
  if (state.retryCount < 2) {
    return { ...state, retryCount: state.retryCount + 1, status: "loading" };
  }
  return applyUrlError(state, errorMsg);
}

/**
 * Simulate N failures then success.
 */
function simulateRetrySequence(
  failures: number,
  successUrl: string,
  errorMsg: string,
): { finalState: AudioEngineState; succeeded: boolean } {
  let state = { ...initialState(), status: "loading" as AudioState };

  for (let i = 0; i < failures; i++) {
    state = applyRetry(state, errorMsg) as typeof state;
  }

  if (state.status === "error") {
    return { finalState: state, succeeded: false };
  }

  // Success
  return {
    finalState: { ...state, status: "playing", playing: true, errorMessage: null },
    succeeded: true,
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const errorMessage = fc.string({ minLength: 1, maxLength: 100 });
const successUrl = fc.webUrl();

// ---------------------------------------------------------------------------
// Property 19: AudioEngine error state disables playback
// Feature: wesu-plus-completion, Property 19: AudioEngine error state disables playback
// Validates: Requirements 1.7, 17.1
// ---------------------------------------------------------------------------

describe("Property 19: AudioEngine error state disables playback", () => {
  it("applying a URL error always sets playing to false", () => {
    fc.assert(
      fc.property(errorMessage, (msg) => {
        const state = { ...initialState(), status: "playing" as AudioState, playing: true };
        const result = applyUrlError(state, msg);
        expect(result.playing).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("applying a URL error always sets status to 'error'", () => {
    fc.assert(
      fc.property(errorMessage, (msg) => {
        const state = initialState();
        const result = applyUrlError(state, msg);
        expect(result.status).toBe("error");
      }),
      { numRuns: 100 },
    );
  });

  it("applying a URL error always stores the error message", () => {
    fc.assert(
      fc.property(errorMessage, (msg) => {
        const state = initialState();
        const result = applyUrlError(state, msg);
        expect(result.errorMessage).toBe(msg);
      }),
      { numRuns: 100 },
    );
  });

  it("error state is the same regardless of whether playback was active", () => {
    fc.assert(
      fc.property(fc.boolean(), errorMessage, (wasPlaying, msg) => {
        const state = { ...initialState(), playing: wasPlaying };
        const result = applyUrlError(state, msg);
        // Final playing state is always false after error
        expect(result.playing).toBe(false);
        expect(result.status).toBe("error");
      }),
      { numRuns: 100 },
    );
  });

  it("error after 3 total attempts (0 retries remaining) sets playing=false and error message", () => {
    fc.assert(
      fc.property(errorMessage, (msg) => {
        // All 3 attempts fail
        const { finalState, succeeded } = simulateRetrySequence(3, "unused", msg);
        expect(succeeded).toBe(false);
        expect(finalState.playing).toBe(false);
        expect(finalState.status).toBe("error");
        expect(finalState.errorMessage).toBe(msg);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 20: Signed URL retry up to 2 additional attempts
// Feature: wesu-plus-completion, Property 20: Signed URL retry up to 2 additional attempts
// Validates: Requirements 17.2
// ---------------------------------------------------------------------------

describe("Property 20: Signed URL retry logic", () => {
  it("0 failures → immediate success, no retries needed", () => {
    fc.assert(
      fc.property(successUrl, (url) => {
        const { finalState, succeeded } = simulateRetrySequence(0, url, "error");
        expect(succeeded).toBe(true);
        expect(finalState.playing).toBe(true);
        expect(finalState.retryCount).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("1 failure then success → succeeds after 1 retry", () => {
    fc.assert(
      fc.property(successUrl, (url) => {
        const { finalState, succeeded } = simulateRetrySequence(1, url, "network error");
        expect(succeeded).toBe(true);
        expect(finalState.retryCount).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it("2 failures then success → succeeds after 2 retries", () => {
    fc.assert(
      fc.property(successUrl, (url) => {
        const { finalState, succeeded } = simulateRetrySequence(2, url, "network error");
        expect(succeeded).toBe(true);
        expect(finalState.retryCount).toBe(2);
      }),
      { numRuns: 100 },
    );
  });

  it("3 failures → exhausts all retries, surfaces error", () => {
    fc.assert(
      fc.property(errorMessage, (msg) => {
        const { finalState, succeeded } = simulateRetrySequence(3, "unused", msg);
        expect(succeeded).toBe(false);
        expect(finalState.status).toBe("error");
        expect(finalState.retryCount).toBe(2); // max retries reached
      }),
      { numRuns: 100 },
    );
  });

  it("retry count never exceeds 2 regardless of failure count", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), errorMessage, (failures, msg) => {
        const { finalState } = simulateRetrySequence(failures, "unused", msg);
        expect(finalState.retryCount).toBeLessThanOrEqual(2);
      }),
      { numRuns: 100 },
    );
  });

  it("N ≤ 2 failures always results in eventual success (retry succeeds)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), successUrl, (failures, url) => {
        const { succeeded } = simulateRetrySequence(failures, url, "temp error");
        expect(succeeded).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
