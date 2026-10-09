/**
 * Offline-mode queue rules.
 *
 * These tests import the real modules. An earlier vault test re-implemented the
 * logic it was checking, which is why it stayed green when the shipped code
 * broke — so nothing here is a mirror.
 *
 * The behaviour being pinned is Spotify's: with Offline mode on, the player only
 * ever holds tracks that are on the device.
 */
import { describe, expect, it } from "vitest";

import { mayQueueOffline, planOfflineQueue } from "@/lib/offline-queue";
import {
  __resetVaultIndexForTests,
  getCachedVaultIds,
  isVaultIndexReady,
  noteVaultChanged,
  setCachedVaultIds,
  subscribeVaultIndex as subscribe,
} from "@/lib/vault-index";

const t = (id: string) => ({ id });

describe("planOfflineQueue with the mode OFF", () => {
  it("passes the queue through untouched", () => {
    const requested = [t("a"), t("b"), t("c")];
    const plan = planOfflineQueue(requested, 1, false, new Set());
    expect(plan.tracks).toBe(requested);
    expect(plan.startIndex).toBe(1);
    expect(plan.filtered).toBe(false);
  });

  it("keeps an EMPTY id set from emptying the queue", () => {
    // This is the cold-start bug: the index has not been read yet, so it is
    // empty. With the mode off that must not mean "nothing may play".
    const plan = planOfflineQueue([t("a"), t("b")], 0, false, new Set());
    expect(plan.tracks).toHaveLength(2);
    expect(plan.empty).toBe(false);
  });

  it("still clamps an out-of-range start index", () => {
    expect(planOfflineQueue([t("a"), t("b")], 99, false, new Set()).startIndex).toBe(1);
    expect(planOfflineQueue([t("a"), t("b")], -5, false, new Set()).startIndex).toBe(0);
  });
});

describe("planOfflineQueue with the mode ON", () => {
  const onDevice = new Set(["a", "c"]);

  it("keeps only downloaded tracks", () => {
    const plan = planOfflineQueue([t("a"), t("b"), t("c")], 0, true, onDevice);
    expect(plan.tracks.map((x) => x.id)).toEqual(["a", "c"]);
    expect(plan.filtered).toBe(true);
    expect(plan.empty).toBe(false);
  });

  it("starts on the track that was tapped, not the first survivor", () => {
    // Tapping "c" while "a" also survives must play "c". Playing a different
    // song from the one tapped is disorienting, and under Offline mode the
    // listener cannot even see the one we substituted.
    const plan = planOfflineQueue([t("a"), t("b"), t("c")], 2, true, onDevice);
    expect(plan.tracks[plan.startIndex].id).toBe("c");
  });

  it("falls back to the first survivor when the tapped track was filtered out", () => {
    const plan = planOfflineQueue([t("a"), t("b"), t("c")], 1, true, onDevice);
    expect(plan.tracks[plan.startIndex].id).toBe("a");
  });

  it("reports empty rather than clearing, so playback is not stopped", () => {
    const plan = planOfflineQueue([t("x"), t("y")], 0, true, onDevice);
    expect(plan.empty).toBe(true);
    expect(plan.tracks).toHaveLength(0);
  });

  it("treats an unread index as nothing downloaded", () => {
    // The caller guards this with isVaultIndexReady(); the rule itself must be
    // consistent — with an empty set, nothing is allowed.
    expect(planOfflineQueue([t("a")], 0, true, new Set()).empty).toBe(true);
  });

  it("does not report filtered when everything survived", () => {
    const plan = planOfflineQueue([t("a"), t("c")], 0, true, onDevice);
    expect(plan.filtered).toBe(false);
  });
});

describe("mayQueueOffline", () => {
  it("allows anything while the mode is off", () => {
    expect(mayQueueOffline("anything", false, new Set())).toBe(true);
  });

  it("allows only downloaded tracks while it is on", () => {
    expect(mayQueueOffline("a", true, new Set(["a"]))).toBe(true);
    expect(mayQueueOffline("b", true, new Set(["a"]))).toBe(false);
  });
});

describe("the vault index the player reads", () => {
  it("reports NOT ready before any read, so a cold start is not silenced", () => {
    __resetVaultIndexForTests();
    expect(isVaultIndexReady()).toBe(false);
    // The player skips filtering while this is false. If it defaulted to ready,
    // the first queue after a cold start would be emptied.
  });

  it("becomes ready and holds the ids after a read", () => {
    setCachedVaultIds(["a", "b"]);
    expect(isVaultIndexReady()).toBe(true);
    expect([...getCachedVaultIds()].sort()).toEqual(["a", "b"]);
  });

  it("stays current after a download and a removal", () => {
    setCachedVaultIds(["a"]);
    noteVaultChanged("b", true);
    expect(getCachedVaultIds().has("b")).toBe(true);
    noteVaultChanged("a", false);
    expect(getCachedVaultIds().has("a")).toBe(false);
  });

  it("ignores an empty song id rather than storing a phantom entry", () => {
    setCachedVaultIds(["a"]);
    noteVaultChanged("", true);
    expect(getCachedVaultIds().size).toBe(1);
  });

  it("notifies subscribers so a UI can react without polling", () => {
    let hits = 0;
    const off = subscribe(() => hits++);
    noteVaultChanged("z", true);
    off();
    noteVaultChanged("z", false);
    expect(hits).toBe(1);
  });
});
