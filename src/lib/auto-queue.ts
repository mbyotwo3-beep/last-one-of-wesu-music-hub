/**
 * Auto-queue: what plays AFTER a song someone started on its own.
 *
 * Testers' rule, in their own words: playing a song should never strand you
 * on a one-track queue. If it came from a playlist, the playlist was already
 * queued by that page; a downloaded song pulls the whole downloads vault
 * behind it; a liked song pulls all liked songs; anything else queues songs
 * SIMILAR to what is playing (same artist, then genre, then trending).
 *
 * HOW IT RUNS
 *
 * Playback must start at the instant of the tap — `setQueue` is synchronous
 * by design (see vault-index.ts) — so the context lookups (liked list,
 * similar songs) are remote reads that CANNOT sit in front of it. Instead the
 * seed is queued immediately and the tail is appended in the background:
 *
 *   startWithAutoQueue(seed)  →  setQueue([seed], 0)        (plays now)
 *                             →  expandAutoQueue(seed.id)   (async, appends)
 *
 * The expansion only fires while the queue is STILL exactly the lone seed —
 * if the listener has meanwhile skipped, re-selected or cleared, their newer
 * decision wins and the expansion silently stands down. Appending (never
 * replacing) also means the seed keeps playing untouched: no restart, no
 * progress reset.
 *
 * Server functions are imported lazily inside the orchestrator so this module
 * stays importable from node tests and from surfaces that never play.
 */

import { usePlayer, type PlayerTrack } from "@/stores/player";
import { getCachedVaultIds, isVaultIndexReady } from "@/lib/vault-index";
import { readOnline } from "@/lib/offline-availability";

/** How far the automatic tail may run. Matches the persisted queue cap. */
export const AUTO_QUEUE_LIMIT = 50;

export type AutoQueueContext = "downloads" | "liked" | "similar";

/**
 * Which context fills the tail after `seedId`? PURE — the decision table is
 * unit-tested. Precedence follows the testers' wording: downloads first (the
 * song is ON this device — its neighbours are the other songs on it), then
 * liked (the song is in the listener's favourites — queue the favourites),
 * then similar songs while online. Offline with a streaming-only seed there
 * is nothing honest to append: the liked and similar pools are both remote.
 */
export function pickAutoQueueContext(args: {
  seedId: string;
  downloadedIds: ReadonlySet<string>;
  /** The signed-in listener's liked song ids, or null when unknown/signed out. */
  likedIds: readonly string[] | null;
  online: boolean;
}): AutoQueueContext | null {
  if (args.downloadedIds.has(args.seedId)) return "downloads";
  if (args.likedIds && args.likedIds.includes(args.seedId)) return "liked";
  if (args.online) return "similar";
  return null;
}

/** First occurrence wins — a song never occupies two places in the queue. */
export function dedupeTracks(tracks: readonly PlayerTrack[]): PlayerTrack[] {
  const seen = new Set<string>();
  const out: PlayerTrack[] = [];
  for (const t of tracks) {
    if (!t || !t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/**
 * Rows of `getSimilarSongs` (id,title,duration,price,cover_url,artist) →
 * PlayerTrack. Malformed rows are skipped, not coerced into ghosts.
 */
export function similarRowsToTracks(rows: readonly unknown[]): PlayerTrack[] {
  const out: PlayerTrack[] = [];
  for (const row of rows as any[]) {
    if (!row?.id || !row?.title) continue;
    out.push({
      id: row.id,
      title: row.title,
      artistName: row.artist?.name ?? "Unknown",
      coverUrl: row.cover_url,
      durationSeconds: row.duration ?? undefined,
      price: row.price ?? undefined,
    });
  }
  return out;
}

/**
 * Rows of `listSavedTracks` (saved_tracks join) → PlayerTrack. The join shape
 * is `{ song_id, songs: { id, title, cover_url, duration, artists } }`.
 */
export function savedRowsToTracks(rows: readonly unknown[]): PlayerTrack[] {
  const out: PlayerTrack[] = [];
  for (const row of rows as any[]) {
    const s = row?.songs;
    if (!s?.id || !s?.title) continue;
    out.push({
      id: s.id,
      title: s.title,
      artistName: s.artists?.name ?? "Unknown",
      coverUrl: s.cover_url,
      durationSeconds: s.duration ?? undefined,
    });
  }
  return out;
}

/** Vault metadata (one entry per download) → PlayerTrack, same as Play all. */
export function vaultMetaToTracks(metas: readonly unknown[]): PlayerTrack[] {
  const out: PlayerTrack[] = [];
  for (const m of metas as any[]) {
    if (!m?.songId || !m?.title) continue;
    out.push({
      id: m.songId,
      title: m.title,
      artistName: m.artistName ?? "Unknown",
      coverUrl: m.coverUrl,
    });
  }
  return out;
}

/**
 * Append the context tail after a lone seed — or stand down if the listener
 * has already moved on. Errors are logged, never thrown into the tap: the
 * seed is playing; a failed nicety must not surface as a player error.
 */
export async function expandAutoQueue(seedId: string): Promise<void> {
  const isLoneSeed = () => {
    const s = usePlayer.getState();
    return s.queue.length === 1 && s.queueIndex === 0 && s.queue[0]?.id === seedId;
  };
  if (!seedId || !isLoneSeed()) return;

  const online = readOnline();
  const downloaded = isVaultIndexReady() && getCachedVaultIds().has(seedId);

  // Liked membership needs the listener's list — a remote read, so it is only
  // consulted online. A failed read counts as "unknown" and falls through.
  let likedIds: string[] | null = null;
  if (online && !downloaded) {
    try {
      const { listSavedTrackIds } = await import("@/lib/saved-tracks.functions");
      const ids = await listSavedTrackIds();
      // Malformed payloads fail loudly here rather than reading as "not liked".
      if (!Array.isArray(ids)) throw new Error("saved-track ids came back as a non-array");
      likedIds = ids;
    } catch (e) {
      console.error("[auto-queue] could not read liked songs:", e);
      likedIds = null;
    }
  }

  switch (pickAutoQueueContext({ seedId, downloadedIds: getCachedVaultIds(), likedIds, online })) {
    case "downloads": {
      try {
        const { listVaultMeta } = await import("@/lib/offline-vault");
        const metas = await listVaultMeta();
        if (!Array.isArray(metas)) throw new Error("vault metadata came back as a non-array");
        append(dedupeTracks(vaultMetaToTracks(metas)));
      } catch (e) {
        console.error("[auto-queue] could not read the downloads vault:", e);
      }
      return;
    }
    case "liked": {
      try {
        const { listSavedTracks } = await import("@/lib/saved-tracks.functions");
        const rows = await listSavedTracks();
        if (!Array.isArray(rows)) throw new Error("liked songs came back as a non-array");
        append(dedupeTracks(savedRowsToTracks(rows)));
      } catch (e) {
        console.error("[auto-queue] could not read liked songs:", e);
      }
      return;
    }
    case "similar": {
      try {
        const { getSimilarSongs } = await import("@/lib/music.functions");
        const rows = await getSimilarSongs({ data: { song_id: seedId, limit: AUTO_QUEUE_LIMIT } });
        if (!Array.isArray(rows)) throw new Error("similar songs came back as a non-array");
        append(dedupeTracks(similarRowsToTracks(rows)));
      } catch (e) {
        console.error("[auto-queue] could not queue similar songs:", e);
      }
      return;
    }
    default:
      return;
  }

  function append(tracks: PlayerTrack[]) {
    // Re-guard AFTER the awaits: only fill the queue this seed started.
    if (!isLoneSeed()) return;
    const extra = tracks.filter((t) => t.id !== seedId).slice(0, AUTO_QUEUE_LIMIT);
    if (extra.length > 0) usePlayer.getState().addManyToQueue(extra);
  }
}

/**
 * THE entry point for surfaces that play a single song on its own (shelf
 * cards, rows, song page). Starts the seed instantly, then fills the tail in
 * the background per the context rules above.
 */
export function startWithAutoQueue(seed: PlayerTrack): void {
  usePlayer.getState().setQueue([seed], 0);
  void expandAutoQueue(seed.id).catch((e) =>
    console.error("[auto-queue] expansion failed:", e),
  );
}
