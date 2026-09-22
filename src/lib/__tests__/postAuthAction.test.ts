/**
 * Tests for the post-auth "continue" flow (src/lib/post-auth-action.ts).
 *
 * Anonymous users start like/follow/save/invite flows that need auth. The
 * intent must survive OAuth and email-confirmation round-trips, replay
 * exactly once after the session appears, and land the user back where
 * they started — never strand them, never replay twice, never trust
 * non-string payloads.
 *
 * Test framework : Vitest
 */

import { describe, it, expect } from "vitest";
import {
  stashPendingAction,
  takePendingAction,
  mergePendingAction,
  hasPendingAction,
  safeAppRedirect,
  type PendingAction,
} from "../post-auth-action";

function memoryStorage(initial?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    size: () => map.size,
  };
}

describe("stash/take round trip", () => {
  it("stores and consumes an intent exactly once", () => {
    const s = memoryStorage();
    const intent: PendingAction = {
      action: "like",
      itemId: "song-1",
      itemType: "song",
      redirect: "/songs/song-1",
    };
    stashPendingAction(s, intent);
    expect(takePendingAction(s)).toEqual(intent);
    // Single-use: second take finds nothing (no double-replay).
    expect(takePendingAction(s)).toBeNull();
  });

  it("returns null when nothing was stashed", () => {
    expect(takePendingAction(memoryStorage())).toBeNull();
  });

  it("returns null on malformed payloads and drops non-string fields", () => {
    const bad = memoryStorage();
    bad.setItem("pending_post_auth_action", "not-json{{{");
    expect(takePendingAction(bad)).toBeNull();

    const injected = memoryStorage();
    injected.setItem(
      "pending_post_auth_action",
      JSON.stringify({ action: "like", itemId: 42, redirect: ["x"], invite: null }),
    );
    expect(takePendingAction(injected)).toEqual({
      action: "like",
      artistId: undefined,
      itemId: undefined,
      itemType: undefined,
      redirect: undefined,
      invite: undefined,
    });
  });

  it("never throws when storage is unavailable", () => {
    expect(() => stashPendingAction(undefined, { action: "like" })).not.toThrow();
    expect(takePendingAction(undefined)).toBeNull();
  });
});

describe("mergePendingAction", () => {
  it("fresh URL params win, stash fills the gaps", () => {
    const merged = mergePendingAction(
      { redirect: "/browse" },
      { action: "follow", artistId: "a1", redirect: "/artists/a1" },
    );
    expect(merged).toEqual({
      action: "follow",
      artistId: "a1",
      itemId: undefined,
      itemType: undefined,
      redirect: "/browse",
      invite: undefined,
    });
  });

  it("works with no stash (plain email login)", () => {
    expect(
      mergePendingAction({ action: "like", itemId: "s1", itemType: "song" }, null),
    ).toEqual({
      action: "like",
      artistId: undefined,
      itemId: "s1",
      itemType: "song",
      redirect: undefined,
      invite: undefined,
    });
  });
});

describe("hasPendingAction", () => {
  it("is true for actions, invites, and bare redirects", () => {
    expect(hasPendingAction({ action: "like" })).toBe(true);
    expect(hasPendingAction({ invite: "inv-1" })).toBe(true);
    expect(hasPendingAction({ redirect: "/library" })).toBe(true);
    expect(hasPendingAction({})).toBe(false);
  });
});

describe("safeAppRedirect", () => {
  it("allows same-origin paths and falls back otherwise", () => {
    expect(safeAppRedirect("/library")).toBe("/library");
    expect(safeAppRedirect("https://evil.example/phish")).toBe("/dashboard");
    expect(safeAppRedirect("//evil.example/x")).toBe("/dashboard");
    expect(safeAppRedirect(undefined)).toBe("/dashboard");
  });
});
