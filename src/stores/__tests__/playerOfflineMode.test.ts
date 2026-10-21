/**
 * The player store's queue rules, exercised against the REAL store.
 *
 * The offline-mode filtering in player.ts was previously only covered by tests
 * on the pure function in offline-queue.ts. Those pass whether or not the store
 * calls the function at all — which is exactly the gap that hid a real bug:
 *
 *   setQueue stored `plan.tracks` but read `tracks[safeIndex]`. Whenever offline
 *   mode filtered anything, the store therefore selected a track that was not in
 *   the queue it had just stored. Nothing played, and Next drew an index from a
 *   queue that did not contain the current track.
 *
 * A pure-function test cannot catch that. These drive the actual store.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { usePlayer } from "@/stores/player";
import { useOfflineMode } from "@/stores/offline-mode";
import { __resetVaultIndexForTests, setCachedVaultIds } from "@/lib/vault-index";

const t = (id: string) => ({ id, title: `Track ${id}`, artistName: "A" });

beforeEach(() => {
  __resetVaultIndexForTests();
  useOfflineMode.setState({ enabled: false });
  usePlayer.setState({
    queue: [],
    queueIndex: 0,
    track: null,
    playing: false,
    shuffle: false,
    shuffleDeck: null,
    error: null,
    repeat: "off",
  });
});

describe("setQueue with offline mode OFF", () => {
  it("stores the queue and selects the requested track", () => {
    usePlayer.getState().setQueue([t("a"), t("b"), t("c")], 2);
    const s = usePlayer.getState();
    expect(s.queue.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(s.track?.id).toBe("c");
    expect(s.queue[s.queueIndex].id).toBe("c");
    expect(s.error).toBeNull();
  });
});

/**
 * No connection — the manual mode is retired, so the flag is off and the
 * connection is the only input.
 *
 * This block exists because that combination was broken and nothing noticed.
 * The player filtered the queue only under the MODE, while the interface already
 * treated a dropped connection as offline and dimmed the rows accordingly. So a
 * shelf could look correctly greyed out and still hand the player tracks it had
 * no way to fetch — each one then died asking for a signed URL. Nothing was
 * thrown, so nothing was logged, and the report was "the shelf doesn't play".
 *
 * It is worth its own file-level block because the fix is one condition in the
 * player's filter, and that condition is easy to revert while fixing something
 * else in the same function.
 */
describe("setQueue with NO CONNECTION and mode off", () => {
  beforeEach(() => {
    // navigator.onLine is the input the player reads. Setting it directly is the
    // only way to exercise the state — there is no offline-mode setting that
    // produces it.
    Object.defineProperty(globalThis.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    setCachedVaultIds(["a", "c"]);
  });

  afterEach(() => {
    Object.defineProperty(globalThis.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("filters the queue to downloads even though the mode is off", () => {
    usePlayer.getState().setQueue([t("a"), t("b"), t("c")], 0);
    expect(usePlayer.getState().queue.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("explains itself when nothing in the shelf is downloaded", () => {
    setCachedVaultIds([]);
    usePlayer.getState().setQueue([t("a"), t("b")], 0);
    // Not the mode's wording — that would blame the listener for the network.
    expect(usePlayer.getState().error).toMatch(/you're offline|no connection/i);
  });

  it("plays a downloaded track normally", () => {
    usePlayer.getState().setQueue([t("a"), t("b")], 0);
    const s = usePlayer.getState();
    expect(s.track?.id).toBe("a");
    expect(s.error).toBeNull();
  });

  it("still honours an unread vault rather than emptying the queue", () => {
    __resetVaultIndexForTests();
    usePlayer.getState().setQueue([t("a"), t("b")], 0);
    expect(usePlayer.getState().queue.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("setQueue with offline mode ON", () => {
  beforeEach(() => {
    useOfflineMode.setState({ enabled: true });
    setCachedVaultIds(["a", "c"]);
  });

  it("filters the stored queue to what is on the device", () => {
    usePlayer.getState().setQueue([t("a"), t("b"), t("c")], 0);
    expect(usePlayer.getState().queue.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("selects a track that is actually IN the stored queue", () => {
    // The regression: the store used to read the unfiltered array here, so with
    // "b" filtered out it selected a track the queue did not contain.
    usePlayer.getState().setQueue([t("a"), t("b"), t("c")], 1);
    const s = usePlayer.getState();
    expect(s.track?.id).toBe("a");
    expect(s.queue[s.queueIndex].id).toBe(s.track?.id);
  });

  it("starts on the tapped track when it survives", () => {
    usePlayer.getState().setQueue([t("a"), t("b"), t("c")], 2);
    const s = usePlayer.getState();
    expect(s.track?.id).toBe("c");
    expect(s.queue[s.queueIndex].id).toBe("c");
  });

  it("sizes the shuffle deck to the FILTERED queue", () => {
    usePlayer.setState({ shuffle: true });
    usePlayer.getState().setQueue([t("a"), t("b"), t("c")], 0);
    const s = usePlayer.getState();
    expect(s.queue).toHaveLength(2);
    // The deck holds every position EXCEPT the one playing, so a 2-track queue
    // has 1 entry. A deck built from the unfiltered length (3) would carry
    // index 2, which no longer exists, and Next would play nothing.
    expect(s.shuffleDeck?.order).toHaveLength(s.queue.length - 1);
    for (const i of s.shuffleDeck?.order ?? []) {
      expect(i).toBeLessThan(s.queue.length);
    }
  });

  it("refuses rather than clearing the song already playing", () => {
    usePlayer.getState().setQueue([t("a"), t("c")], 0);
    const playing = usePlayer.getState().track?.id;
    expect(playing).toBe("a");

    usePlayer.getState().setQueue([t("x"), t("y")], 0);
    const s = usePlayer.getState();
    expect(s.track?.id).toBe("a");
    expect(s.queue.map((x) => x.id)).toEqual(["a", "c"]);
    expect(s.error).toMatch(/downloaded|offline/i);
  });

  it("does not filter while the index has never been read", () => {
    // An unread index is empty; treating that as "nothing downloaded" would
    // silence playback for every listener on a cold start.
    __resetVaultIndexForTests();
    usePlayer.getState().setQueue([t("a"), t("b")], 0);
    expect(usePlayer.getState().queue).toHaveLength(2);
  });
});

describe("addToQueue with offline mode ON", () => {
  beforeEach(() => {
    useOfflineMode.setState({ enabled: true });
    setCachedVaultIds(["a"]);
  });

  it("appends a downloaded track", () => {
    usePlayer.getState().setQueue([t("a")], 0);
    usePlayer.getState().addToQueue(t("a"));
    expect(usePlayer.getState().queue).toHaveLength(2);
  });

  it("refuses an undownloaded track and says which one", () => {
    usePlayer.getState().setQueue([t("a")], 0);
    usePlayer.getState().addToQueue(t("z"));
    const s = usePlayer.getState();
    expect(s.queue).toHaveLength(1);
    expect(s.error).toContain("Track z");
  });
});

describe("an empty request still clears", () => {
  it("setQueue([]) stops playback", () => {
    usePlayer.getState().setQueue([t("a")], 0);
    usePlayer.getState().setQueue([], 0);
    const s = usePlayer.getState();
    expect(s.queue).toHaveLength(0);
    expect(s.track).toBeNull();
    expect(s.playing).toBe(false);
  });
});
