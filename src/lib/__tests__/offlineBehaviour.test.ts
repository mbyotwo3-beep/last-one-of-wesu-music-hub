/**
 * Offline behaviour, checked against Spotify's model.
 *
 * Spotify separates DOWNLOADS (deliberately kept, encrypted, app-only, on a
 * 30-day licence) from CACHE (evicted under storage pressure), and it frees
 * unused downloads to make room rather than simply refusing the new one.
 *
 * Two gaps were found in ours:
 *
 *   1. no Offline mode at all — there was no way to ask for a download-only
 *      session, only to lose the connection;
 *   2. a full vault just threw, so a listener with a large library hit a dead
 *      end and had to delete tracks by hand.
 *
 * These tests pin the eviction decision and the licence window. The pure
 * functions are imported from the real modules — the earlier vault tests
 * re-implemented their logic and could not fail when the shipped code broke.
 */
import { describe, expect, it } from "vitest";

import {
  VAULT_LICENSE_MAX_AGE_MS,
  decideStaleVaultPlayback,
  planEviction,
} from "@/lib/offline-vault";

describe("planEviction", () => {
  const lib = [
    { songId: "old", size: 100, downloadedAt: 1_000 },
    { songId: "mid", size: 100, downloadedAt: 2_000 },
    { songId: "new", size: 100, downloadedAt: 3_000 },
  ];

  it("evicts nothing when there is room", () => {
    expect(planEviction(lib, 100, 250)).toEqual([]);
    expect(planEviction(lib, 50, 50)).toEqual([]);
    // Exactly enough free is enough — evicting here would be destructive for
    // no reason.
    expect(planEviction(lib, 100, 100)).toEqual([]);
  });

  it("evicts the oldest first", () => {
    // Needs 150 bytes into 0 free: oldest (100) is not enough, so both oldest go.
    expect(planEviction(lib, 150, 0)).toEqual(["old", "mid"]);
  });

  it("stops as soon as enough room exists", () => {
    expect(planEviction(lib, 100, 0)).toEqual(["old"]);
    expect(planEviction(lib, 100, 99)).toEqual(["old"]);
  });

  it("counts existing free space before removing anything", () => {
    expect(planEviction(lib, 150, 100)).toEqual(["old"]);
    expect(planEviction(lib, 150, 250)).toEqual([]);
  });

  it("evicts everything it is asked to when nothing else fits", () => {
    // A download larger than the whole library: report every victim rather
    // than silently returning none and failing with a confusing error.
    expect(planEviction(lib, 10_000, 0)).toEqual(["old", "mid", "new"]);
  });

  it("treats an unknown size as zero rather than negative", () => {
    const withGap = [
      { songId: "a", size: 0, downloadedAt: 1 },
      { songId: "b", size: 100, downloadedAt: 2 },
    ];
    expect(planEviction(withGap, 50, 0)).toEqual(["a", "b"]);
  });

  it("never returns a duplicate when sizes tie", () => {
    const same = [
      { songId: "x", size: 50, downloadedAt: 1 },
      { songId: "y", size: 50, downloadedAt: 1 },
    ];
    const victims = planEviction(same, 50, 0);
    expect(new Set(victims).size).toBe(victims.length);
  });
});

describe("the 30-day licence, as Spotify has it", () => {
  it("is 30 days", () => {
    expect(VAULT_LICENSE_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("decideStaleVaultPlayback", () => {
  it("plays a fresh copy", () => {
    expect(
      decideStaleVaultPlayback({ stale: false, online: true, probePurchaseFailed: false }),
    ).toBe("play");
  });

  it("still plays while offline, even if stale — offline must work offline", () => {
    expect(
      decideStaleVaultPlayback({ stale: true, online: false, probePurchaseFailed: false }),
    ).toBe("play");
    // Even a confirmed failure does not block offline: there is no network to
    // revoke anything over, and the listener is owed the music they downloaded.
    expect(
      decideStaleVaultPlayback({ stale: true, online: false, probePurchaseFailed: true }),
    ).toBe("play");
  });

  it("blocks only when online AND the purchase probe failed", () => {
    expect(decideStaleVaultPlayback({ stale: true, online: true, probePurchaseFailed: true })).toBe(
      "blocked",
    );
    expect(
      decideStaleVaultPlayback({ stale: true, online: true, probePurchaseFailed: false }),
    ).toBe("play");
  });
});
