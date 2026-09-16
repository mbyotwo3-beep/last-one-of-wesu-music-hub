/**
 * Server-only payment fulfillment logic.
 * Called by the Lenco webhook handler after a transaction is confirmed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
 * - song | album → insert a completed purchase and its revenue split.
 * - playlist → fan out into one completed purchase + one completed child
 *   song transaction per bundled song. Each child fires the revenue-split
 *   trigger for its own song, so every artist/label/collaborator is paid
 *   exactly as if the buyer had purchased that song directly. The parent
 *   bundle row is only the receipt (the trigger ignores item_type
 *   'playlist' by design).
 */
export async function fulfillTransaction(tx: PaymentTransaction): Promise<void> {
  if (tx.item_type === "playlist") {
    await fulfillPlaylistBundle(tx);
    return;
  }
  if (tx.item_type !== "song" && tx.item_type !== "album") {
    throw new Error("Unsupported payment item type");
  }
  await fulfillPurchase(tx);
}

async function fulfillPlaylistBundle(tx: PaymentTransaction): Promise<void> {
  const meta = (tx.metadata ?? {}) as Record<string, unknown>;
  const songs = Array.isArray(meta.songs) ? (meta.songs as any[]) : [];
  // Fall back to recomputing (defensive: old rows without a snapshot).
  let bundle: { song_id: string; amount: number }[] = songs
    .filter((s) => s && typeof s.song_id === "string")
    .map((s) => ({ song_id: s.song_id as string, amount: Number(s.amount) || 0 }));

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
      if (!song) continue;
      const { error: purchaseError } = await supabaseAdmin
        .from("purchases")
        .insert({
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
      const { error: childError } = await supabaseAdmin
        .from("payment_transactions")
        .insert({
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
      if (childError) throw new Error(`fulfillPlaylistBundle child tx failed: ${childError.message}`);
    }
  }
}

async function fulfillPurchase(tx: PaymentTransaction): Promise<void> {
  const songId = tx.item_type === "song" ? tx.item_id : null;
  const albumId = tx.item_type === "album" ? tx.item_id : null;

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
      album_id: albumId,
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
): Promise<"completed" | "failed" | "pending" | "fulfillment_failed"> {
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
    await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "failed", provider_ref: providerRef ?? null, metadata } as any)
      .eq("id", transactionId)
      .in("status", ["pending", "processing", "fulfillment_failed"]);
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
  if (current.item_type !== "song" && current.item_type !== "album" && current.item_type !== "playlist") {
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
  let claimed = current;
  if (current.status !== "processing") {
    const { data: processing } = await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "processing", provider_ref: providerRef ?? null } as any)
      .eq("id", transactionId)
      .in("status", ["pending", "fulfillment_failed"])
      .select()
      .maybeSingle();
    if (!processing) return "pending";
    claimed = processing;
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
