/**
 * Server-only payment fulfillment logic.
 * Called by the Lenco webhook handler after a transaction is confirmed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { allocateBundleTotal, buildBundle, bundleIsFulfillable } from "./money-invariants";

interface PaymentTransaction {
  id: string;
  user_id: string;
  item_type: "song" | "album" | "playlist";
  item_id: string | null;
  amount: number;
  currency: string;
  method_code: string;
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Fulfill a completed payment transaction.
 *
 * - song → insert a completed purchase and its revenue split.
 * - album | playlist → fan out into one completed purchase + one completed
 *   child song transaction per track. Each child fires the revenue-split
 *   trigger for its own song, so every artist/label/collaborator is paid
 *   exactly as if the buyer had purchased that track directly. The parent
 *   bundle row is only the receipt (the trigger ignores item_type 'album' and
 *   'playlist' by design).
 *
 * Albums are fanned out rather than settled as one opaque row because a single
 * album purchase row leaves three things broken: the ownership guard could
 * never see it (so buyers were charged twice), the listener's library showed
 * none of its tracks as purchased, and the revenue trigger — which needs a
 * `song_id` to find collaborators — paid the whole album to `albums.artist_id`
 * and every credited collaborator nothing.
 */
export async function fulfillTransaction(tx: PaymentTransaction): Promise<void> {
  if (tx.item_type === "playlist") {
    await fulfillPlaylistBundle(tx);
    return;
  }
  if (tx.item_type === "album") {
    await fulfillAlbum(tx);
    return;
  }
  if (tx.item_type !== "song") {
    throw new Error("Unsupported payment item type");
  }
  await fulfillPurchase(tx);
}

async function fulfillPlaylistBundle(tx: PaymentTransaction): Promise<void> {
  const meta = (tx.metadata ?? {}) as Record<string, unknown>;
  const bundle = buildBundle(meta.songs);

  // An empty bundle would silently fall through the loop below and settle the
  // transaction as "completed" — money taken, nothing granted, no error, and
  // the buyer sees a success receipt. Fail loudly so settleTransaction marks
  // it "fulfillment_failed" and support can see it.
  if (!bundleIsFulfillable(bundle)) {
    throw new Error("Playlist payment has no song bundle to fulfil");
  }

  // Tracks deleted between checkout and fulfilment: the buyer paid for them and
  // cannot receive them. Record which so reconciliation/support can refund.
  const unfulfilled: string[] = [];
  for (const { song_id, amount } of bundle) {
    const ref = `${tx.id}:${song_id}`;

    // 1. Purchase row (idempotent on the unique transaction reference).
    const { data: existingPurchase } = await supabaseAdmin
      .from("purchases")
      .select("id")
      .eq("transaction_ref", ref)
      .maybeSingle();
    if (!existingPurchase) {
      // Skip songs that vanished after payment (deleted/taken down) rather
      // than granting entitlements for ghosts.
      const { data: song } = await supabaseAdmin
        .from("songs")
        .select("id")
        .eq("id", song_id)
        .maybeSingle();
      if (!song) {
        unfulfilled.push(song_id);
        continue;
      }
      const { error: purchaseError } = await supabaseAdmin.from("purchases").insert({
        user_id: tx.user_id,
        song_id,
        album_id: null,
        status: "completed",
        amount,
        payment_method: tx.method_code,
        transaction_ref: ref,
      } as any);
      // Lost race with a concurrent fulfilment — the other worker owns it.
      if (purchaseError && purchaseError.code !== "23505") {
        throw new Error(`fulfillPlaylistBundle purchase failed: ${purchaseError.message}`);
      }
    }

    // 2. Child song transaction (idempotent). Inserting it completed fires
    // the revenue-split trigger for exactly this song. Ordered AFTER the
    // purchase so a crash between the two still converges on retry: the
    // purchase check above passes, and this check creates the missing child.
    const { data: existingChild } = await supabaseAdmin
      .from("payment_transactions")
      .select("id")
      .eq("item_type", "song")
      .eq("item_id", song_id)
      .eq("user_id", tx.user_id)
      .eq("status", "completed")
      .filter("metadata->>bundle_parent", "eq", tx.id)
      .maybeSingle();
    if (!existingChild) {
      const { error: childError } = await supabaseAdmin.from("payment_transactions").insert({
        user_id: tx.user_id,
        amount,
        currency: tx.currency,
        method_code: tx.method_code,
        provider: tx.provider ?? "lenco",
        provider_ref: null,
        provider_token: null,
        status: "completed",
        item_type: "song",
        item_id: song_id,
        metadata: { bundle_parent: tx.id, phone: (meta.phone as string | null) ?? null },
      } as any);
      if (childError)
        throw new Error(`fulfillPlaylistBundle child tx failed: ${childError.message}`);
    }
  }

  // Paid for tracks that no longer exist. Record them on the parent so
  // reconciliation can find and refund them — never fail the whole
  // fulfilment, the buyer still keeps everything that DID exist.
  if (unfulfilled.length > 0) {
    try {
      await supabaseAdmin
        .from("payment_transactions")
        .update({ metadata: { ...meta, unfulfilled_song_ids: unfulfilled } })
        .eq("id", tx.id);
    } catch (e) {
      console.error("[payments] could not record unfulfilled playlist songs", tx.id, e);
    }
  }
}

/**
 * Settle an album purchase by fanning it out across the release's tracks.
 *
 * Each track gets its own `purchases` row and its own completed child song
 * transaction. The child transaction is the important half: the revenue-split
 * trigger needs a `song_id` to find that track's collaborators, so without it
 * an album sale paid the album's owner everything and the people credited on
 * the tracks nothing.
 *
 * `album_id` is set on the per-track rows as well as the receipt, so album
 * earnings reporting and the ownership guard both resolve from one query.
 */
async function fulfillAlbum(tx: PaymentTransaction): Promise<void> {
  const albumId = tx.item_id;
  if (!albumId) throw new Error("Album payment has no album id");

  const { data: tracks, error: tracksError } = await supabaseAdmin
    .from("songs")
    .select("id,price")
    .eq("album_id", albumId)
    .eq("status", "approved")
    .order("track_number", { ascending: true });
  if (tracksError) throw new Error(`fulfillAlbum track lookup failed: ${tracksError.message}`);

  const approved = tracks ?? [];
  // An album with no approved tracks cannot be delivered. Taking the money and
  // settling "completed" would show the buyer a success receipt for nothing.
  if (approved.length === 0) throw new Error("Album payment has no approved tracks to fulfil");

  // The album receipt: one row marking the release owned, so it appears under
  // Purchased Albums and so the ownership guard sees it. It carries no amount
  // because the money is attributed per track — summing purchases by album_id
  // still yields the album total via the per-track rows.
  const receiptRef = `${tx.id}:album`;
  const { data: existingReceipt } = await supabaseAdmin
    .from("purchases")
    .select("id")
    .eq("transaction_ref", receiptRef)
    .maybeSingle();
  if (!existingReceipt) {
    const { error: receiptError } = await supabaseAdmin.from("purchases").insert({
      user_id: tx.user_id,
      song_id: null,
      album_id: albumId,
      status: "completed",
      amount: 0,
      payment_method: tx.method_code,
      transaction_ref: receiptRef,
    } as any);
    if (receiptError && receiptError.code !== "23505")
      throw new Error(`fulfillAlbum receipt failed: ${receiptError.message}`);
  }

  // Tracks already owned individually must not be paid for twice.
  const { data: ownedRows } = await supabaseAdmin
    .from("purchases")
    .select("song_id")
    .eq("user_id", tx.user_id)
    .eq("status", "completed")
    .in(
      "song_id",
      approved.map((t: any) => t.id),
    );
  const owned = new Set((ownedRows ?? []).map((r: any) => r.song_id).filter(Boolean));

  // Free tracks need no entitlement bought (they are already playable) and
  // must not receive a share of the album price.
  const payable = approved.filter((t: any) => Number(t.price ?? 0) > 0 && !owned.has(t.id));

  // Money taken but nothing new to grant. Checkout blocks this via
  // alreadyOwnsItem; if a track was removed between payment and fulfilment it
  // can still happen. Fail loudly so reconciliation can see it rather than
  // settling a purchase that delivered nothing.
  if (payable.length === 0) throw new Error("Album payment has no unowned paid tracks to fulfil");

  // Split the album price across the tracks in proportion to their list prices
  // rather than paying each its own price: an album is often cheaper than the
  // sum of its tracks, and paying full price per track would distribute more
  // than the buyer paid.
  const allocation = allocateBundleTotal(
    tx.amount,
    payable.map((t: any) => ({ song_id: t.id as string, weight: Number(t.price) })),
  );
  if (!bundleIsFulfillable(allocation)) throw new Error("Album payment has no tracks to fulfil");

  for (const { song_id, amount } of allocation) {
    const ref = `${tx.id}:${song_id}`;

    const { data: existingPurchase } = await supabaseAdmin
      .from("purchases")
      .select("id")
      .eq("transaction_ref", ref)
      .maybeSingle();
    if (!existingPurchase) {
      // Skip tracks deleted after payment rather than granting entitlements
      // for ghosts. The buyer keeps everything that still exists.
      const { data: song } = await supabaseAdmin
        .from("songs")
        .select("id")
        .eq("id", song_id)
        .maybeSingle();
      if (!song) continue;

      const { error: purchaseError } = await supabaseAdmin.from("purchases").insert({
        user_id: tx.user_id,
        song_id,
        album_id: albumId,
        status: "completed",
        amount,
        payment_method: tx.method_code,
        transaction_ref: ref,
      } as any);
      if (purchaseError && purchaseError.code !== "23505")
        throw new Error(`fulfillAlbum purchase failed: ${purchaseError.message}`);
    }

    // Child song transaction, inserted AFTER the purchase so a crash between
    // the two converges on retry: the purchase check above passes and this
    // creates the missing child.
    const { data: existingChild } = await supabaseAdmin
      .from("payment_transactions")
      .select("id")
      .eq("item_type", "song")
      .eq("item_id", song_id)
      .eq("user_id", tx.user_id)
      .eq("status", "completed")
      .filter("metadata->>bundle_parent", "eq", tx.id)
      .maybeSingle();
    if (!existingChild) {
      const { error: childError } = await supabaseAdmin.from("payment_transactions").insert({
        user_id: tx.user_id,
        amount,
        currency: tx.currency,
        method_code: tx.method_code,
        provider: tx.provider ?? "lenco",
        provider_ref: null,
        provider_token: null,
        status: "completed",
        item_type: "song",
        item_id: song_id,
        metadata: { bundle_parent: tx.id, bundle_kind: "album", phone: null },
      } as any);
      if (childError) throw new Error(`fulfillAlbum child tx failed: ${childError.message}`);
    }
  }
}

async function fulfillPurchase(tx: PaymentTransaction): Promise<void> {
  // Albums never reach here — they fan out per track in fulfillAlbum. Only a
  // single-song purchase settles as one row with no album attached.
  const songId = tx.item_id;

  // A provider may send the same successful callback more than once. The
  // transaction transition normally serializes fulfilment, and this check
  // makes a recovery attempt harmless if a request stopped after the
  // entitlement was created but before the transaction was marked completed.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("purchases")
    .select("id")
    .eq("transaction_ref", tx.id)
    .maybeSingle();
  if (existingError) throw new Error(`fulfillPurchase lookup failed: ${existingError.message}`);
  if (existing) return;

  const { error } = await supabaseAdmin
    .from("purchases")
    .insert({
      user_id: tx.user_id,
      song_id: songId,
      album_id: null,
      status: "completed",
      amount: tx.amount,
      payment_method: tx.method_code,
      transaction_ref: tx.id,
    } as any)
    .select("id")
    .single();

  // The unique transaction reference index makes this safe even if two server
  // requests race after a process restart. The other request already created
  // the entitlement, so there is nothing further to do.
  if (error?.code === "23505") return;
  if (error) throw new Error(`fulfillPurchase failed: ${error.message}`);
}

/**
 * Idempotently move a pending transaction to its final state and fulfil it.
 * Safe to call from both the webhook and the client-side status poller —
 * only the caller that wins the `pending -> completed` update fulfils.
 */
export async function settleTransaction(
  transactionId: string,
  outcome: "successful" | "failed",
  providerRef?: string | null,
  failureReason?: string | null,
): Promise<"completed" | "failed" | "pending" | "processing" | "fulfillment_failed"> {
  if (outcome === "failed") {
    // Preserve the original request metadata (including the phone number) and
    // attach Lenco's reason so the receipt can explain an actual decline.
    const { data: pending } = await supabaseAdmin
      .from("payment_transactions")
      .select("metadata")
      .eq("id", transactionId)
      .in("status", ["pending", "processing", "fulfillment_failed"])
      .maybeSingle();
    const existingMetadata =
      pending?.metadata && typeof pending.metadata === "object" && !Array.isArray(pending.metadata)
        ? pending.metadata
        : {};
    const metadata = failureReason
      ? { ...(existingMetadata as Record<string, unknown>), failure_reason: failureReason }
      : existingMetadata;
    const { data: marked } = await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "failed", provider_ref: providerRef ?? null, metadata } as any)
      .eq("id", transactionId)
      .in("status", ["pending", "processing", "fulfillment_failed"])
      .select("status")
      .maybeSingle();
    // A LATE failure webhook for a transaction that already completed must not
    // be reported as a failure: returning "failed" here made verifyPayment tell
    // a buyer whose purchase was delivered that their payment failed. Report
    // what the row actually says.
    if (!marked) {
      const { data: after } = await supabaseAdmin
        .from("payment_transactions")
        .select("status")
        .eq("id", transactionId)
        .maybeSingle();
      const actual = (after as any)?.status;
      if (actual === "completed" || actual === "failed") return actual;
    }
    return "failed";
  }

  // A historical or tampered transaction must never activate a subscription
  // while subscription sales are paused.
  const { data: current } = await supabaseAdmin
    .from("payment_transactions")
    .select("*")
    .eq("id", transactionId)
    .maybeSingle();
  if (!current) return "pending";
  if (
    current.item_type !== "song" &&
    current.item_type !== "album" &&
    current.item_type !== "playlist"
  ) {
    await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "failed", provider_ref: providerRef ?? null } as any)
      .eq("id", transactionId)
      .eq("status", "pending");
    return "failed";
  }

  if (current.status === "completed") return "completed";
  if (current.status === "failed") return "failed";

  // Claim the transaction before making the entitlement available. This
  // prevents duplicate Lenco delivery from producing duplicate purchases and
  // means the database split trigger runs only after a purchase exists.
  //
  // The claim is UNCONDITIONAL. It used to be skipped when the row was already
  // "processing", which is precisely the state the Lenco webhook and the
  // client's status poller both converge on — so both proceeded to fulfil
  // concurrently and the idempotency this comment promised was never enforced.
  // If the update matches no row, someone else owns the fulfilment; report
  // their state and let the caller poll instead of double-granting.
  const { data: claimed } = await supabaseAdmin
    .from("payment_transactions")
    .update({ status: "processing", provider_ref: providerRef ?? null } as any)
    .eq("id", transactionId)
    .in("status", ["pending", "fulfillment_failed"])
    .select()
    .maybeSingle();

  if (!claimed) {
    const { data: owned } = await supabaseAdmin
      .from("payment_transactions")
      .select("status")
      .eq("id", transactionId)
      .maybeSingle();
    const status = (owned as any)?.status;
    if (status === "completed" || status === "failed") return status;
    // "processing" = another caller is fulfilling right now.
    return "processing";
  }

  try {
    await fulfillTransaction(claimed as any);
    const { error: completeError } = await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "completed", provider_ref: providerRef ?? null } as any)
      .eq("id", transactionId)
      .eq("status", "processing");
    if (completeError) throw new Error(completeError.message);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unable to fulfil purchase";
    console.error("[payments] Fulfilment failed:", detail);
    await supabaseAdmin
      .from("payment_transactions")
      .update({
        status: "fulfillment_failed",
        metadata: {
          ...(claimed.metadata && typeof claimed.metadata === "object" ? claimed.metadata : {}),
          fulfillment_error: detail,
        },
      } as any)
      .eq("id", transactionId)
      .eq("status", "processing");
    return "fulfillment_failed";
  }
  return "completed";
}
