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

  const { data: purchase, error } = await supabaseAdmin
    .from("purchases")
    .insert({
      user_id: tx.user_id,
      song_id: songId,
      album_id: albumId,
      status: "completed",
      amount: tx.amount,
    } as any)
    .select()
    .single();

  if (error) throw new Error(`fulfillPurchase failed: ${error.message}`);

  // Create revenue split — find the artist and record payout owed
  if (purchase && tx.item_id) {
    const table = tx.item_type === "song" ? "songs" : "albums";
    const { data: item } = await supabaseAdmin
      .from(table as "songs")
      .select("artist_id")
      .eq("id", tx.item_id)
      .maybeSingle();

    if (item?.artist_id) {
      // Look up the platform commission from settings (default 20%)
      const { data: setting } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "site")
        .maybeSingle();
      const commissionPct = (setting?.value as any)?.commission_pct ?? 20;
      const artistPct = 100 - commissionPct;

      const { data: artistRow } = await supabaseAdmin
        .from("artists")
        .select("user_id")
        .eq("id", item.artist_id)
        .maybeSingle();

      await supabaseAdmin.from("revenue_splits").insert({
        transaction_id: tx.id,
        artist_id: item.artist_id,
        payee_user_id: artistRow?.user_id ?? null,
        amount: (tx.amount * artistPct) / 100,
        pct: artistPct,
        payee_role: "artist",
      } as any);
    }
  }
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
): Promise<"completed" | "failed" | "pending"> {
  if (outcome === "failed") {
    // Preserve the original request metadata (including the phone number) and
    // attach Lenco's reason so the receipt can explain an actual decline.
    const { data: pending } = await supabaseAdmin
      .from("payment_transactions")
      .select("metadata")
      .eq("id", transactionId)
      .eq("status", "pending")
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
    .select("item_type")
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

  const { data: claimed } = await supabaseAdmin
    .from("payment_transactions")
    .update({ status: "completed", provider_ref: providerRef ?? null } as any)
    .eq("id", transactionId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (!claimed) return "completed"; // already settled by another delivery

  try {
    await fulfillTransaction(claimed as any);
  } catch (e) {
    console.error("[payments] Fulfilment failed:", e);
  }
  return "completed";
}
