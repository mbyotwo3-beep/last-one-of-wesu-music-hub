/**
 * Server-only payment fulfillment logic.
 * Called by the Lenco webhook handler after a transaction is confirmed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface PaymentTransaction {
  id: string;
  user_id: string;
  item_type: "song" | "album" | "subscription";
  item_id: string | null;
  amount: number;
  currency: string;
}

/**
 * Fulfill a completed payment transaction.
 *
 * - subscription → upsert subscriptions row (status=active, expires_at=now+interval)
 * - song | album  → insert purchases row (status=completed) + revenue split
 */
export async function fulfillTransaction(tx: PaymentTransaction): Promise<void> {
  if (tx.item_type === "subscription") {
    await fulfillSubscription(tx);
  } else if (tx.item_type === "song" || tx.item_type === "album") {
    await fulfillPurchase(tx);
  }
}

async function fulfillSubscription(tx: PaymentTransaction): Promise<void> {
  // Determine plan interval (default 30 days if not found)
  let intervalDays = 30;
  if (tx.item_id) {
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("interval")
      .eq("id", tx.item_id)
      .maybeSingle();
    if (plan?.interval) {
      const intervalMap: Record<string, number> = {
        week: 7,
        month: 30,
        year: 365,
      };
      intervalDays = intervalMap[plan.interval] ?? intervalDays;
    }
  }

  const expiresAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: tx.user_id,
      plan: tx.item_id ?? "premium",
      status: "active",
      expires_at: expiresAt,
    } as any,
    { onConflict: "user_id" },
  );

  if (error) throw new Error(`fulfillSubscription failed: ${error.message}`);
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
): Promise<"completed" | "failed" | "pending"> {
  if (outcome === "failed") {
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
