/**
 * What counts as a "release" for listing purposes.
 *
 * The bug: shelves that mean "what's new" were querying the songs table, so
 * a 12-track album appeared as twelve separate new releases — the exact
 * opposite of how Spotify lists music. An album is one object with a cover, a
 * track list and one Buy button; its tracks are not products of their own on a
 * release shelf.
 *
 * Spotify's actual rule:
 *   • Release shelves (New Music / New Releases / Recently Added) show ALBUMS
 *     and SINGLES. A track that belongs to an album is reached through that
 *     album, never listed beside it.
 *   • Chart shelves DO list individual tracks, because a chart is a ranking of
 *     plays, not a catalogue of releases. "Hot Tracks" is legitimately a list
 *     of songs.
 *   • Search lists individual tracks, because that is what someone searching
 *     for a track title wants.
 *
 * So: hide album tracks from release shelves, keep them in charts and search.
 */

/** Shelves that list releases rather than individual plays. */
export type Shelf = "release" | "chart" | "search";

/** True when the shelf must exclude tracks that belong to an album. */
export function excludesAlbumTracks(shelf: Shelf): boolean {
  return shelf === "release";
}

/**
 * Pure form of the filter, so the rule is testable without a database.
 * Mirrors the `.is("album_id", null)` the release queries apply.
 */
export function keepForShelf<T extends { album_id?: string | null }>(rows: T[], shelf: Shelf): T[] {
  if (!excludesAlbumTracks(shelf)) return rows;
  return rows.filter((r) => !r.album_id);
}
