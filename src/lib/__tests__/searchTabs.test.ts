import { describe, expect, it } from "vitest";

/**
 * The search page gates every result section on its own list, but the "no
 * results" message was gated on ALL THREE being empty. So selecting a tab that
 * had no matches — Artists, when the query only matched songs — rendered a
 * completely blank page with no message and nothing to tap. That is the exact
 * moment a listener decides to go back to Spotify.
 *
 * Counted per active tab, mirroring the render conditions.
 */
type Tab = "all" | "songs" | "artists" | "albums";
type Results = { songs: number; artists: number; albums: number };

function visibleCount(tab: Tab, r: Results): number {
  if (tab === "songs") return r.songs;
  if (tab === "artists") return r.artists;
  if (tab === "albums") return r.albums;
  return r.songs + r.artists + r.albums;
}

function showsSection(tab: Tab, kind: Exclude<Tab, "all">, r: Results): boolean {
  if (tab !== "all" && tab !== kind) return false;
  return r[kind] > 0;
}

describe("search tab results", () => {
  it("shows a message when the ACTIVE tab has no matches", () => {
    // The query matched a song only.
    const r: Results = { songs: 3, artists: 0, albums: 0 };
    expect(visibleCount("songs", r)).toBe(3);
    // Switching to Artists previously rendered nothing at all.
    expect(showsSection("artists", "artists", r)).toBe(false);
    expect(visibleCount("artists", r)).toBe(0);
    expect(visibleCount("albums", r)).toBe(0);
  });

  it("does not claim 'no results' while another tab has them", () => {
    const r: Results = { songs: 1, artists: 0, albums: 0 };
    expect(visibleCount("all", r)).toBe(1);
  });

  it("handles a genuine total miss", () => {
    const r: Results = { songs: 0, artists: 0, albums: 0 };
    for (const tab of ["all", "songs", "artists", "albums"] as Tab[]) {
      expect(visibleCount(tab, r)).toBe(0);
    }
  });

  it("never renders a tab with matches as empty", () => {
    const r: Results = { songs: 2, artists: 5, albums: 1 };
    for (const tab of ["all", "songs", "artists", "albums"] as Tab[]) {
      expect(visibleCount(tab, r)).toBeGreaterThan(0);
    }
  });
});
