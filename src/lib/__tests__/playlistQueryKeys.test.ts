/**
 * A React Query key must mean one shape.
 *
 * This was the highest-impact bug in the playlist feature. Three components
 * shared the key ["my-playlists", user.id]:
 *
 *   ShareMenu     select("id, name")            no staleTime
 *   playlists.tsx select("*, playlist_songs(…")  staleTime 30s
 *   library.tsx   select("*, playlist_songs(…")  staleTime 30s
 *
 * ShareMenu has no staleTime, so it refetched on every mount and rewrote the
 * shared entry as id/name-only. /playlists and /library then read
 * `playlist.playlist_songs` as undefined and rendered every playlist as "0
 * songs" with a disabled Play button. Which page looked broken depended on which
 * request settled last, so it flickered.
 *
 * Nothing type-checked this, because the data is `any` end to end. So this reads
 * the source and asserts the invariant directly: a given key literal must always
 * be paired with the same select() shape.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = "src";

/** Files that read or write a listener's own playlists. */
const SCOPED = ["ShareMenu", "playlists", "library", "BottomTabBar", "AppleMusicSidebar"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Pair each query DEFINITION's `queryKey: ["a", ...]` with the select() that
 * follows it.
 *
 * Only definitions count. `queryKey:` also appears inside invalidateQueries,
 * cancelQueries and setQueryData, and those take the same argument shape —
 * matching them produced a bogus collision on ["playlist", id], where one hit
 * was a real query and the others were cache invalidations picking up an
 * unrelated select further down the file.
 */
function keySelectPairs(file: string): { key: string; select: string }[] {
  const src = readFileSync(file, "utf8");
  const pairs: { key: string; select: string }[] = [];
  const keyRe = /queryKey:\s*\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(src))) {
    // What produced this queryKey? The nearest preceding call wins.
    //
    // The window has to be generous: a query preceded by an explanatory comment
    // can push `useQuery(` more than a few hundred characters back, and a window
    // that misses it makes every definition look like an invalidation.
    const before = src.slice(Math.max(0, m.index - 2000), m.index);
    const lastOf = (names: string[]) => Math.max(...names.map((n) => before.lastIndexOf(n + "(")));
    const isDefinition =
      lastOf(["useQuery", "useSuspenseQuery", "useInfiniteQuery", "queryOptions"]) >
      lastOf([
        "invalidateQueries",
        "cancelQueries",
        "setQueryData",
        "removeQueries",
        "resetQueries",
      ]);
    if (!isDefinition) continue;

    // Look only inside this query block: up to the next queryKey or 1200 chars.
    const rest = src.slice(m.index, m.index + 1200);
    const nextKey = rest.indexOf("queryKey:", 1);
    const block = nextKey > 0 ? rest.slice(0, nextKey) : rest;
    const sel = block.match(/\.select\(\s*[`"']([^`"']+)/);
    pairs.push({
      key: m[1].replace(/\s+/g, " ").trim(),
      select: sel ? sel[1].replace(/\s+/g, " ").trim() : "(none)",
    });
  }
  return pairs;
}

describe("playlist React Query keys", () => {
  const files = walk(SRC).filter((f) => SCOPED.some((s) => f.includes(s)));

  it("finds the playlist consumers to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never pairs one key literal with two different select shapes", () => {
    const shapes = new Map<string, Set<string>>();
    for (const f of files) {
      for (const { key, select } of keySelectPairs(f)) {
        if (!shapes.has(key)) shapes.set(key, new Set());
        shapes.get(key)!.add(select);
      }
    }

    const collisions = [...shapes.entries()].filter(([, s]) => s.size > 1);
    expect(collisions.map(([key, s]) => `${key} -> ${[...s].join("  ||  ")}`).join("\n")).toBe("");
  });

  it("keeps the name-only picker off the full-row key", () => {
    // The specific regression: the picker needs id+name, the pages need
    // playlist_songs. Sharing the key let whichever refetched last win.
    const picker = files
      .filter((f) => f.includes("ShareMenu"))
      .flatMap(keySelectPairs)
      .find((p) => p.select === "id, name");
    expect(picker).toBeDefined();
    expect(picker!.key).not.toContain('"my-playlists"');
  });
});
