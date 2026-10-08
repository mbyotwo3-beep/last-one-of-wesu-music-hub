/**
 * Pure money helpers for payment fulfilment, kept separate from the Supabase
 * calls so the invariants that protect buyers are unit-tested:
 *
 *  - an album must never settle empty (money taken, nothing granted)
 *  - the parts of a split must sum to EXACTLY the total charged
 *
 * Album selling is the only bundle product. Playlists were briefly priced as
 * one, then removed: a playlist is a listening and curation feature, and paid
 * tracks in it are bought individually or through their album.
 */

/**
 * Whether a bundle can be fulfilled at all. An empty bundle must raise rather
 * than let the transaction settle as "completed": the buyer paid, and
 * settleTransaction would mark it delivered with zero purchases.
 */
export function bundleIsFulfillable(bundle: { song_id: string }[]): boolean {
  return bundle.length > 0;
}

/**
 * Split one total across several tracks, so the parts sum to EXACTLY the total.
 *
 * An album is not necessarily the sum of its tracks — artists discount bundles,
 * and a release uploaded before per-track pricing existed has tracks priced
 * independently of the album. Paying each track its own list price would hand
 * out more money than the buyer paid, so the total is allocated in proportion
 * to each track's weight instead.
 *
 * All arithmetic is in integer cents. Float money drifts: 0.1 + 0.2 !== 0.3,
 * and a split that misses by one ngwee is an unreconcilable payout.
 *
 * Largest-remainder rounding: floor everything, then hand the leftover cents to
 * the tracks with the largest truncated fractions. Ties break on input order
 * so the same input always yields the same split — fulfilment must be
 * reproducible or a retry pays an artist differently from the first attempt.
 */
export function allocateBundleTotal(
  total: number,
  items: { song_id: string; weight: number }[],
): { song_id: string; amount: number }[] {
  const targetCents = Math.round((Number(total) || 0) * 100);
  if (targetCents <= 0) return [];

  // Trim-checked, not just typeof: `typeof "" === "string"`, and a blank
  // song_id would sail through into a purchases insert with an invalid uuid.
  const eligible = items.filter(
    (i) => i && typeof i.song_id === "string" && i.song_id.trim().length > 0,
  );
  if (!eligible.length) return [];

  // Tracks priced at 0 earn nothing from the bundle: they are already playable
  // for free, so charging for them would take money for nothing. If that leaves
  // nothing to allocate to, the album carries an explicit price over an
  // all-free tracklist and there is no weight to split by — split it evenly
  // rather than paying whichever track happens to come first.
  let weights = eligible.map((i) => {
    const w = Number(i.weight);
    return Number.isFinite(w) && w > 0 ? w : 0;
  });
  if (weights.every((w) => w === 0)) weights = eligible.map(() => 1);

  const sumWeight = weights.reduce((a, b) => a + b, 0);
  if (sumWeight <= 0) return [];

  const shares = weights.map((w) => (targetCents * w) / sumWeight);
  const cents = shares.map((s) => Math.floor(s));
  let remainder = targetCents - cents.reduce((a, b) => a + b, 0);

  const order = shares
    .map((share, index) => ({ index, frac: share - Math.floor(share) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (let i = 0; remainder > 0 && i < order.length; i++, remainder--) {
    cents[order[i].index] += 1;
  }

  return eligible.map((item, index) => ({
    song_id: item.song_id,
    amount: cents[index] / 100,
  }));
}
