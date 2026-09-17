/**
 * Regression tests for shared-playlist unlock bundles.
 *
 * Rules under test (pure models mirroring listener.functions.ts,
 * payments.functions.ts and payments.server.ts):
 * - owners never get a bundle; free / song-owned / album-owned tracks are
 *   excluded; non-approved tracks are never sold; total = sum of missing.
 * - fulfilment fans out per song with idempotent refs so retries converge
 *   (purchase exists + child missing → child still created; both exist →
 *   no-op).
 * - only song/album/playlist item types settle.
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Missing-song computation model
// ---------------------------------------------------------------------------

interface BundleSong {
  id: string;
  title: string;
  price: number;
  status: string;
  album_id: string | null;
}

function computeMissing(args: {
  isOwner: boolean;
  songs: BundleSong[];
  ownedSongIds: string[];
  ownedAlbumIds: string[];
}): { missing: BundleSong[]; total: number } {
  if (args.isOwner) return { missing: [], total: 0 };
  const ownedSongs = new Set(args.ownedSongIds);
  const ownedAlbums = new Set(args.ownedAlbumIds);
  const missing = args.songs.filter((s) => {
    if (s.status !== "approved" || !(s.price > 0)) return false;
    if (ownedSongs.has(s.id)) return false;
    if (s.album_id && ownedAlbums.has(s.album_id)) return false;
    return true;
  });
  return { missing, total: missing.reduce((sum, s) => sum + s.price, 0) };
}

const arbSong: fc.Arbitrary<BundleSong> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 20 }),
  price: fc.integer({ min: 0, max: 100 }),
  status: fc.constantFrom("approved", "pending", "rejected", "draft"),
  album_id: fc.option(fc.uuid(), { nil: null }),
});

describe("Playlist bundle missing computation", () => {
  it("owners never get a bundle", () => {
    fc.assert(
      fc.property(fc.array(arbSong, { maxLength: 10 }), (songs) => {
        const { missing, total } = computeMissing({
          isOwner: true,
          songs,
          ownedSongIds: [],
          ownedAlbumIds: [],
        });
        expect(missing).toEqual([]);
        expect(total).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("free and non-approved songs are never charged", () => {
    fc.assert(
      fc.property(fc.array(arbSong, { maxLength: 10 }), (songs) => {
        const { missing } = computeMissing({
          isOwner: false,
          songs,
          ownedSongIds: [],
          ownedAlbumIds: [],
        });
        for (const m of missing) {
          expect(m.status).toBe("approved");
          expect(m.price).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("song-owned and album-owned tracks are excluded", () => {
    const songs: BundleSong[] = [
      { id: "a", title: "A", price: 10, status: "approved", album_id: "al1" },
      { id: "b", title: "B", price: 20, status: "approved", album_id: "al1" },
      { id: "c", title: "C", price: 30, status: "approved", album_id: null },
    ];
    const bySong = computeMissing({ isOwner: false, songs, ownedSongIds: ["a"], ownedAlbumIds: [] });
    expect(bySong.missing.map((m) => m.id).sort()).toEqual(["b", "c"]);
    expect(bySong.total).toBe(50);
    const byAlbum = computeMissing({ isOwner: false, songs, ownedSongIds: [], ownedAlbumIds: ["al1"] });
    expect(byAlbum.missing.map((m) => m.id)).toEqual(["c"]);
    expect(byAlbum.total).toBe(30);
  });

  it("total always equals the sum of missing prices", () => {
    fc.assert(
      fc.property(
        fc.array(arbSong, { maxLength: 12 }),
        fc.array(fc.uuid(), { maxLength: 12 }),
        fc.array(fc.uuid(), { maxLength: 5 }),
        (songs, ownedSongs, ownedAlbums) => {
          const { missing, total } = computeMissing({
            isOwner: false,
            songs,
            ownedSongIds: ownedSongs,
            ownedAlbumIds: ownedAlbums,
          });
          expect(total).toBe(missing.reduce((s, m) => s + m.price, 0));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Fan-out fulfilment idempotency model
// ---------------------------------------------------------------------------

interface FanoutDb {
  purchases: Set<string>; // transaction_ref values present
  children: Set<string>; // `${parentTx}:${songId}` child txs present
}

function fanoutSong(db: FanoutDb, parentTx: string, songId: string): { purchase: boolean; child: boolean } {
  const ref = `${parentTx}:${songId}`;
  let purchase = false;
  let child = false;
  if (!db.purchases.has(ref)) {
    db.purchases.add(ref);
    purchase = true;
  }
  if (!db.children.has(ref)) {
    db.children.add(ref);
    child = true;
  }
  return { purchase, child };
}

describe("Bundle fan-out idempotency", () => {
  it("first run creates both rows for every song", () => {
    const db: FanoutDb = { purchases: new Set(), children: new Set() };
    for (const s of ["s1", "s2", "s3"]) {
      expect(fanoutSong(db, "tx", s)).toEqual({ purchase: true, child: true });
    }
  });

  it("retry after full success is a complete no-op", () => {
    const db: FanoutDb = { purchases: new Set(), children: new Set() };
    for (const s of ["s1", "s2"]) fanoutSong(db, "tx", s);
    for (const s of ["s1", "s2"]) {
      expect(fanoutSong(db, "tx", s)).toEqual({ purchase: false, child: false });
    }
  });

  it("crash between purchase and child still converges (child created on retry)", () => {
    const db: FanoutDb = { purchases: new Set(["tx:s1"]), children: new Set() };
    expect(fanoutSong(db, "tx", "s1")).toEqual({ purchase: false, child: true });
    expect(fanoutSong(db, "tx", "s1")).toEqual({ purchase: false, child: false });
  });

  it("refs are unique per parent and song (no cross-talk between bundles)", () => {
    const db: FanoutDb = { purchases: new Set(), children: new Set() };
    fanoutSong(db, "tx1", "s1");
    expect(fanoutSong(db, "tx2", "s1")).toEqual({ purchase: true, child: true });
  });
});

// ---------------------------------------------------------------------------
// Reorder model (mirrors movePlaylistSong: adjacent swap by direction)
// ---------------------------------------------------------------------------

function moveSong(ids: string[], songId: string, dir: "up" | "down"): string[] {
  const next = [...ids];
  const idx = next.findIndex((id) => id === songId);
  if (idx === -1) return next;
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= next.length) return next;
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return next;
}

describe("Playlist reorder", () => {
  it("moves a middle song up and down", () => {
    expect(moveSong(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveSong(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("edges are no-ops", () => {
    expect(moveSong(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveSong(["a", "b"], "b", "down")).toEqual(["a", "b"]);
  });

  it("unknown song leaves order untouched", () => {
    fc.assert(
      fc.property(fc.array(fc.uuid(), { maxLength: 8 }), fc.uuid(), (ids, missing) => {
        fc.pre(!ids.includes(missing));
        expect(moveSong(ids, missing, "up")).toEqual(ids);
      }),
      { numRuns: 100 },
    );
  });

  it("up then down round-trips", () => {
    fc.assert(
      fc.property(fc.array(fc.uuid(), { minLength: 3, maxLength: 8 }), (ids) => {
        const uniq = [...new Set(ids)];
        fc.pre(uniq.length >= 3);
        const mid = uniq[1];
        expect(moveSong(moveSong(uniq, mid, "up"), mid, "down")).toEqual(uniq);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Follow rules model (mirrors togglePlaylistFollow)
// ---------------------------------------------------------------------------

function canFollow(args: {
  isOwner: boolean;
  isPublic: boolean;
  alreadyFollowing: boolean;
}): { ok: boolean; following?: boolean; error?: string } {
  if (args.isOwner) return { ok: false, error: "already in library" };
  if (!args.isPublic) return { ok: false, error: "private" };
  return { ok: true, following: !args.alreadyFollowing };
}

describe("Playlist follow rules", () => {
  it("owners cannot follow their own list", () => {
    expect(canFollow({ isOwner: true, isPublic: true, alreadyFollowing: false }).ok).toBe(false);
  });

  it("private lists cannot be followed", () => {
    expect(canFollow({ isOwner: false, isPublic: false, alreadyFollowing: false }).ok).toBe(false);
  });

  it("follow toggles both ways on public lists", () => {
    expect(canFollow({ isOwner: false, isPublic: true, alreadyFollowing: false })).toEqual({
      ok: true,
      following: true,
    });
    expect(canFollow({ isOwner: false, isPublic: true, alreadyFollowing: true })).toEqual({
      ok: true,
      following: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Playlist update validation model (mirrors updatePlaylist)
// ---------------------------------------------------------------------------

function validatePlaylistPatch(patch: { name?: string; description?: string | null }): string[] {
  const errors: string[] = [];
  if (patch.name !== undefined) {
    if (!patch.name.trim()) errors.push("name required");
    if (patch.name.trim().length > 120) errors.push("name too long");
  }
  const desc = (patch.description ?? "").trim();
  if (desc.length > 1000) errors.push("description too long");
  return errors;
}

describe("Playlist update validation", () => {
  it("blank names rejected, 120 chars accepted", () => {
    expect(validatePlaylistPatch({ name: "  " })).toContain("name required");
    expect(validatePlaylistPatch({ name: "a".repeat(120) })).toEqual([]);
    expect(validatePlaylistPatch({ name: "a".repeat(121) })).toContain("name too long");
  });

  it("empty patch is a no-op", () => {
    expect(validatePlaylistPatch({})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Settle gate model
// ---------------------------------------------------------------------------

function canSettle(itemType: string): boolean {
  return itemType === "song" || itemType === "album" || itemType === "playlist";
}

describe("Settle item gate", () => {
  it("allows song, album and playlist bundles; rejects everything else", () => {
    expect(canSettle("song")).toBe(true);
    expect(canSettle("album")).toBe(true);
    expect(canSettle("playlist")).toBe(true);
    expect(canSettle("subscription")).toBe(false);
    expect(canSettle("")).toBe(false);
  });
});
