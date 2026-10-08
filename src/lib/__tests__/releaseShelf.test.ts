/**
 * Release-shelf listing rules.
 *
 * A 12-track album appearing as twelve separate "new releases" is what made
 * the catalogue read unlike Spotify. Release shelves list albums and singles;
 * only charts and search list individual tracks.
 *
 * Mirrors src/lib/release-shelf.ts.
 */

import { describe, expect, it } from "vitest";

type Shelf = "release" | "chart" | "search";

function excludesAlbumTracks(shelf: Shelf): boolean {
  return shelf === "release";
}

function keepForShelf<T extends { id: string; album_id?: string | null }>(
  rows: T[],
  shelf: Shelf,
): T[] {
  if (!excludesAlbumTracks(shelf)) return rows;
  return rows.filter((r) => !r.album_id);
}

const single: { id: string; album_id: string | null } = { id: "s1", album_id: null };
const singleEmpty: { id: string; album_id?: string | null } = { id: "s2" };
const track1: { id: string; album_id: string } = { id: "t1", album_id: "album-1" };
const track2: { id: string; album_id: string } = { id: "t2", album_id: "album-1" };

describe("release shelf policy", () => {
  it("hides album tracks from release shelves", () => {
    expect(excludesAlbumTracks("release")).toBe(true);
  });

  it("keeps album tracks in charts and search", () => {
    // A chart ranks plays; search finds a track by its title.
    expect(excludesAlbumTracks("chart")).toBe(false);
    expect(excludesAlbumTracks("search")).toBe(false);
  });

  it("a release shelf keeps only tracks with no album", () => {
    const out = keepForShelf([single, track1, singleEmpty, track2], "release");
    expect(out.map((r) => r.id)).toEqual(["s1", "s2"]);
  });

  it("a chart keeps every track, album or not", () => {
    const rows = [single, track1, track2];
    expect(keepForShelf(rows, "chart")).toHaveLength(3);
  });

  it("search keeps every track", () => {
    const rows = [single, track1];
    expect(keepForShelf(rows, "search")).toHaveLength(2);
  });

  it("treats a missing album_id as a single, not an album track", () => {
    // Postgres `.is("album_id", null)` also matches rows where the column was
    // never set; the pure form must agree or the two drift apart.
    expect(keepForShelf([singleEmpty], "release")).toHaveLength(1);
  });

  it("treats an empty-string album_id as a single too", () => {
    // Defensive: a blank string is not a real album reference.
    expect(keepForShelf([{ id: "x", album_id: "" }], "release")).toHaveLength(1);
  });

  it("returns an empty release shelf rather than everything when all tracks are album tracks", () => {
    expect(keepForShelf([track1, track2], "release")).toEqual([]);
  });

  it("does not mutate the input", () => {
    const rows = [single, track1];
    keepForShelf(rows, "release");
    expect(rows).toHaveLength(2);
  });
});
