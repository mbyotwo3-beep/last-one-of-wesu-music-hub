/**
 * Auto-queue: playing a lone song never leaves a one-track queue.
 *
 * Pure functions are tested here; the store-level expansion (fetching liked
 * / downloads / similar then appending) is driven against the REAL player
 * store with the remote modules mocked — same seam style as the offline-mode
 * tests in playerOfflineMode.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  pickAutoQueueContext,
  dedupeTracks,
  similarRowsToTracks,
  savedRowsToTracks,
  vaultMetaToTracks,
  expandAutoQueue,
} from "@/lib/auto-queue";
import { usePlayer, type PlayerTrack } from "@/stores/player";
import { __resetVaultIndexForTests, setCachedVaultIds } from "@/lib/vault-index";
import { listVaultMeta } from "@/lib/offline-vault";
import { listSavedTracks, listSavedTrackIds } from "@/lib/saved-tracks.functions";
import { getSimilarSongs } from "@/lib/music.functions";

// Remote modules are mocked for every test in this file; each test sets the
// resolved value it needs. Vitest hoists vi.mock to the top of the file.
vi.mock("@/lib/offline-vault", () => ({
  listVaultMeta: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/saved-tracks.functions", () => ({
  listSavedTracks: vi.fn().mockResolvedValue([]),
  listSavedTrackIds: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/music.functions", () => ({
  getSimilarSongs: vi.fn().mockResolvedValue([]),
}));

const seed = { id: "seed", title: "Seed Song", artistName: "Seed Artist" };

beforeEach(() => {
  __resetVaultIndexForTests();
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
  vi.resetAllMocks();
});

describe("pickAutoQueueContext", () => {
  it("downloads win when the seed is on this device", () => {
    expect(
      pickAutoQueueContext({
        seedId: "d",
        downloadedIds: new Set(["d"]),
        likedIds: ["d"],
        online: false,
      }),
    ).toBe("downloads");
  });

  it("liked wins when the seed is saved but not downloaded", () => {
    expect(
      pickAutoQueueContext({
        seedId: "l",
        downloadedIds: new Set(),
        likedIds: ["l"],
        online: true,
      }),
    ).toBe("liked");
  });

  it("similar is chosen online when the seed is neither downloaded nor liked", () => {
    expect(
      pickAutoQueueContext({
        seedId: "s",
        downloadedIds: new Set(),
        likedIds: [],
        online: true,
      }),
    ).toBe("similar");
  });

  it("nothing to append offline for a streaming-only seed", () => {
    expect(
      pickAutoQueueContext({
        seedId: "s",
        downloadedIds: new Set(),
        likedIds: null,
        online: false,
      }),
    ).toBe(null);
  });

  it("null liked list counts as unknown", () => {
    expect(
      pickAutoQueueContext({
        seedId: "s",
        downloadedIds: new Set(),
        likedIds: null,
        online: true,
      }),
    ).toBe("similar");
  });
});

describe("dedupeTracks", () => {
  it("drops duplicates and nulls, keeps first occurrence", () => {
    const a = { id: "a", title: "A", artistName: "X" };
    expect(dedupeTracks([a, a, null as unknown as PlayerTrack, { id: "b", title: "B", artistName: "X" }, a])).toEqual([
      a,
      { id: "b", title: "B", artistName: "X" },
    ]);
  });
});

describe("similarRowsToTracks", () => {
  it("maps rows, skipping malformed ones", () => {
    const rows = [
      { id: "1", title: "One", artist: { name: "A" }, cover_url: "c1", duration: 200, price: 10 },
      { id: "2", title: "Two", artist: null },
      { title: "no id" },
      null,
      { id: "3", title: "Three", artist: { name: "B" } },
    ];
    expect(similarRowsToTracks(rows)).toEqual([
      { id: "1", title: "One", artistName: "A", coverUrl: "c1", durationSeconds: 200, price: 10 },
      { id: "2", title: "Two", artistName: "Unknown" },
      { id: "3", title: "Three", artistName: "B" },
    ]);
  });
});

describe("savedRowsToTracks", () => {
  it("maps the saved_tracks join shape, skipping malformed rows", () => {
    const rows = [
      { songs: { id: "s1", title: "S1", artists: { name: "A1" }, cover_url: "c1", duration: 240 } },
      { songs: { id: "s2", title: "S2" } },
      { songs: null },
      { songs: { title: "no id" } },
    ];
    expect(savedRowsToTracks(rows)).toEqual([
      { id: "s1", title: "S1", artistName: "A1", coverUrl: "c1", durationSeconds: 240 },
      { id: "s2", title: "S2", artistName: "Unknown" },
    ]);
  });
});

describe("vaultMetaToTracks", () => {
  it("maps vault metadata the same way Play all does", () => {
    const metas = [
      { songId: "v1", title: "Vault 1", artistName: "AV", coverUrl: "cv1" },
      { songId: "v2", title: "V2" },
      { title: "no id" },
    ];
    expect(vaultMetaToTracks(metas)).toEqual([
      { id: "v1", title: "Vault 1", artistName: "AV", coverUrl: "cv1" },
      { id: "v2", title: "V2", artistName: "Unknown", coverUrl: undefined },
    ]);
  });
});

describe("store-level expansion", () => {
  it("appends the downloads vault behind a downloaded seed", async () => {
    vi.mocked(listVaultMeta).mockResolvedValue([
      { songId: "v1", title: "Vault 1", artistName: "AV", coverUrl: "cv1", mime: "audio/mpeg", size: 100, downloadedAt: 0 },
    ]);
    setCachedVaultIds(["seed"]);

    usePlayer.getState().setQueue([seed], 0);
    await expandAutoQueue(seed.id);

    expect(usePlayer.getState().queue.map((t) => t.id)).toEqual(["seed", "v1"]);
  });

  it("appends liked songs behind a liked seed when online", async () => {
    vi.mocked(listSavedTracks).mockResolvedValue([
      { id: "s1", created_at: "2026-01-01", song_id: "liked1", songs: { id: "liked1", title: "L1", cover_url: "cl1", artist_id: "la", album_id: null, artists: { id: "la", name: "LA" }, duration: 200 } },
    ]);
    vi.mocked(listSavedTrackIds).mockResolvedValue(["seed"]);

    usePlayer.getState().setQueue([seed], 0);
    await expandAutoQueue(seed.id);

    expect(usePlayer.getState().queue.map((t) => t.id)).toEqual(["seed", "liked1"]);
  });

  it("appends similar songs online when the seed is neither downloaded nor liked", async () => {
    vi.mocked(getSimilarSongs).mockResolvedValue([
      { id: "sim1", title: "Sim 1", artist: { id: "sa", name: "SA" }, cover_url: "cs", play_count: 5 },
    ]);

    usePlayer.getState().setQueue([seed], 0);
    await expandAutoQueue(seed.id);

    expect(usePlayer.getState().queue.map((t) => t.id)).toEqual(["seed", "sim1"]);
  });

  it("does not expand when the queue moved on (listener picked something else)", async () => {
    const other = { id: "other", title: "Other", artistName: "OA" };
    usePlayer.getState().setQueue([seed], 0);
    usePlayer.getState().setQueue([other], 0); // listener moved on
    await expandAutoQueue(seed.id);

    expect(usePlayer.getState().queue.map((t) => t.id)).toEqual(["other"]);
  });

  it("never duplicates the seed in the tail", async () => {
    vi.mocked(listVaultMeta).mockResolvedValue([
      { songId: "seed", title: "Seed Song", artistName: "Seed Artist", coverUrl: "cv", mime: "audio/mpeg", size: 100, downloadedAt: 0 },
      { songId: "v2", title: "Vault 2", artistName: "AV", coverUrl: "cv2", mime: "audio/mpeg", size: 100, downloadedAt: 0 },
    ]);
    setCachedVaultIds(["seed"]);

    usePlayer.getState().setQueue([seed], 0);
    await expandAutoQueue(seed.id);

    expect(usePlayer.getState().queue.map((t) => t.id)).toEqual(["seed", "v2"]);
  });
});
