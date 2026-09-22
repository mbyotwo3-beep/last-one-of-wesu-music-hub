import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  shouldSyncPlaying,
  buildNotificationMetadata,
  emitNativeSeek,
  setNativeSeekHook,
  markNativeCommand,
  getLastNativeCommandAt,
  configureNativeAudio,
  clampNativeVolume,
  __resetNativeAudioConfig,
  __resetNativeCommandClock,
} from "../native-audio";

describe("native remote-control reconciler", () => {
  beforeEach(() => {
    __resetNativeCommandClock();
  });

  it("adopts native truth only on genuine disagreement after the grace window", () => {
    const now = 1_000_000;
    // Agreement: never sync.
    expect(shouldSyncPlaying(true, true, now, now - 10_000)).toBe(false);
    expect(shouldSyncPlaying(false, false, now, now - 10_000)).toBe(false);
    // Unknown native state: never sync.
    expect(shouldSyncPlaying(true, null, now, now - 10_000)).toBe(false);
    // Disagreement inside the grace window (our own command in flight): hold.
    expect(shouldSyncPlaying(true, false, now, now - 500)).toBe(false);
    expect(shouldSyncPlaying(false, true, now, now - 1_999)).toBe(false);
    // Disagreement after grace (lock-screen button): sync.
    expect(shouldSyncPlaying(true, false, now, now - 5_000)).toBe(true);
    expect(shouldSyncPlaying(false, true, now, now - 5_000)).toBe(true);
  });

  it("honours a custom grace period", () => {
    const now = 1_000_000;
    expect(shouldSyncPlaying(true, false, now, now - 3_000, 4000)).toBe(false);
    expect(shouldSyncPlaying(true, false, now, now - 4_000, 4000)).toBe(true);
  });

  it("stamps in-app commands on the shared clock", () => {
    expect(getLastNativeCommandAt()).toBe(0);
    markNativeCommand();
    const first = getLastNativeCommandAt();
    expect(first).toBeGreaterThan(0);
    // A fresh command suppresses a stale disagreement.
    expect(shouldSyncPlaying(true, false, first + 100, first)).toBe(false);
    expect(shouldSyncPlaying(true, false, first + 5_000, first)).toBe(true);
  });
});

describe("notification metadata builder", () => {
  it("includes album and artwork when present", () => {
    expect(
      buildNotificationMetadata({
        title: "Song",
        artistName: "Artist",
        albumTitle: "Album",
        artworkUrl: "https://cdn.example.com/a.jpg",
      }),
    ).toEqual({
      title: "Song",
      artist: "Artist",
      album: "Album",
      artworkUrl: "https://cdn.example.com/a.jpg",
    });
  });

  it("omits album and artwork keys when absent", () => {
    const meta = buildNotificationMetadata({ title: "Song", artistName: "Artist" });
    expect(meta).toEqual({ title: "Song", artist: "Artist" });
    expect("album" in meta).toBe(false);
    expect("artworkUrl" in meta).toBe(false);
  });
});

describe("native seek bridge", () => {
  beforeEach(() => {
    setNativeSeekHook(null);
  });

  it("forwards store seeks to the registered hook", () => {
    const hook = vi.fn();
    setNativeSeekHook(hook);
    emitNativeSeek(42);
    expect(hook).toHaveBeenCalledWith(42);
  });

  it("no-ops safely with no hook or a throwing hook", () => {
    expect(() => emitNativeSeek(10)).not.toThrow();
    setNativeSeekHook(() => {
      throw new Error("native gone");
    });
    expect(() => emitNativeSeek(10)).not.toThrow();
  });
});

describe("native configure guard", () => {
  it("resolves false without a plugin and caches the result", async () => {
    __resetNativeAudioConfig();
    // Node test env has no Capacitor bridge: dynamic import fails → false.
    await expect(configureNativeAudio()).resolves.toBe(false);
    await expect(configureNativeAudio()).resolves.toBe(false);
  });
});

describe("native volume clamp", () => {
  it("keeps values in range with a non-zero floor for mute", () => {
    expect(clampNativeVolume(0)).toBe(0.01);
    expect(clampNativeVolume(-3)).toBe(0.01);
    expect(clampNativeVolume(0.5)).toBe(0.5);
    expect(clampNativeVolume(1)).toBe(1);
    expect(clampNativeVolume(9)).toBe(1);
    expect(clampNativeVolume(Number.NaN)).toBe(1);
  });
});

describe("native start-failure recovery model", () => {
  // Mirrors noteNativeStartFailure: first failure per selection re-resolves,
  // a second failure parks as paused. Pure state machine for the test.
  function next(sel: number | null, retried: number | null): "retry" | "park" {
    return retried === sel ? "park" : "retry";
  }

  it("retries once per selection, then parks", () => {
    expect(next(7, null)).toBe("retry");
    expect(next(7, 7)).toBe("park");
    // New selection gets a fresh retry.
    expect(next(8, 7)).toBe("retry");
  });
});
