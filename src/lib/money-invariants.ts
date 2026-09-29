/**
 * Pure money helpers for payment fulfilment, kept separate from the Supabase
 * calls so the invariants that protect buyers are unit-tested:
 *
 *  - a playlist bundle must never settle empty (money taken, nothing granted)
 *  - a total charged must never carry a float tail into the payment provider
 */

export interface BundleSong {
  song_id?: unknown;
  amount?: unknown;
}

/**
 * Turn stored payment metadata into the charge/grant list. Rows without a
 * usable song_id are dropped — they cannot be granted.
 */
export function buildBundle(songs: BundleSong[] | unknown): {
  song_id: string;
  amount: number;
}[] {
  if (!Array.isArray(songs)) return [];
  return (songs as BundleSong[])
    .filter((s) => s && typeof s.song_id === "string")
    .map((s) => ({ song_id: s.song_id as string, amount: Number(s.amount) || 0 }));
}

/**
 * Whether a bundle can be fulfilled at all. An empty bundle must raise rather
 * than let the transaction settle as "completed": the buyer paid, and
 * settleTransaction would mark it delivered with zero purchases.
 */
export function bundleIsFulfillable(bundle: { song_id: string }[]): boolean {
  return bundle.length > 0;
}

/**
 * Playlist unlock total, rounded to 2dp. The same figure is displayed to the
 * buyer and sent to the payment provider, so rounding happens here, once.
 */
export function playlistTotal(missing: { price: number | null | undefined }[]): number {
  const sum = missing.reduce((acc, m) => acc + Number(m.price ?? 0), 0);
  return Math.round(sum * 100) / 100;
}
