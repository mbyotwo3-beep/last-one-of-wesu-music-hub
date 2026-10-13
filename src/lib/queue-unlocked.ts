import type { PlayerTrack } from "@/stores/player";

/**
 * Put a freshly bought song into the queue, so "Play" works straight away.
 *
 * WHY THIS IS NOT JUST setQueue
 *
 * setQueue REPLACES the queue. A listener who had music playing, bought a song
 * from the checkout screen, and came back would find their queue gone and their
 * current track swapped out — for something they bought, not something they were
 * listening to. addToQueue appends, which is what "auto queueing" should mean.
 *
 * WHY IT IS NOT DONE FOR ALBUMS
 *
 * An album can be 12 tracks. Appending all of them turns a purchase into a
 * surprise playlist the listener did not ask for and cannot undo. A single song
 * is unambiguous; an album is a library update, not a queue change. The album's
 * tracks are already in the library, and the entitlement eviction above means
 * they play in full the first time they are tapped.
 *
 * WHY IT RUNS ONCE PER SETTLEMENT
 *
 * The success page POLLS the transaction while it is pending, and the effect
 * above re-runs on every settled status. Queueing is guarded by `done` so a
 * poll landing on "completed" twice cannot put the same song in the queue
 * twice — the listener would hear it start, then hear it again after Next.
 *
 * Nothing here throws. A failed queue is invisible and harmless; the song is
 * bought either way.
 */

const done = new Set<string>();

type Transaction = {
  id?: string;
  item_type?: string | null;
  item_id?: string | null;
} | null;

export async function queueUnlocked(
  status: string | null | undefined,
  transaction: Transaction,
  addToQueue: (track: PlayerTrack) => void,
): Promise<number> {
  if (status !== "completed") return 0;
  const t = transaction as any;
  if (!t || t.item_type !== "song" || !t.item_id) return 0;

  const id = String(t.id ?? "");
  const key = `${id}:${t.item_id}`;
  if (id && done.has(key)) return 0;
  if (id) done.add(key);

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("songs")
      .select("id,title,cover_url,duration,price,artist:artists(id,name)")
      .eq("id", t.item_id)
      .maybeSingle();
    const s = data as any;
    if (!s?.id) return 0;

    addToQueue({
      id: s.id,
      title: s.title,
      artistName: s?.artist?.name ?? "Wesu+",
      coverUrl: s.cover_url ?? undefined,
      durationSeconds: s.duration ?? undefined,
      // A bought song plays in full, so its price is no longer a prompt to buy.
      price: undefined,
    });
    return 1;
  } catch {
    // The purchase stands regardless of whether the queue could be updated.
    return 0;
  }
}

/** Test seam. */
export function resetQueueUnlocked() {
  done.clear();
}
