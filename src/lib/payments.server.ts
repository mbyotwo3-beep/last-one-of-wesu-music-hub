/**
 * Server-only payment fulfillment logic.
 * Called by the Lenco webhook handler after a transaction is confirmed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface PaymentTransaction {
  id: string;
  user_id: string;
  item_type: "song" | "album";
  item_id: string | null;
  amount: number;
  currency: string;
  method_code: string;
}

/**
 * Fulfill a completed payment transaction.
 *
 * - song | album → insert a completed purchase and its revenue split.
 */
export async function fulfillTransaction(tx: PaymentTransaction): Promise<void> {
  if (tx.item_type !== "song" && tx.item_type !== "album") {
    throw new Error("Unsupported payment item type");
  }
  await fulfillPurchase(tx);
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
      .eq("status", "pending");
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
  if (current.item_type !== "song" && current.item_type !== "album") {
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
          ...((claimed.metadata && typeof claimed.metadata === "object") ? claimed.metadata : {}),
          fulfillment_error: detail,
        },
      } as any)
      .eq("id", transactionId)
      .eq("status", "processing");
    return "fulfillment_failed";
  }
  return "completed";
}
