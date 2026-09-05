import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "./roles";

/**
 * Staff-facing reconciliation for payments that never reached a final state.
 *
 * A collection can stall when the customer abandons the USSD prompt, when the
 * webhook is never delivered, or when fulfilment throws after the money moved.
 * These helpers let an admin see those rows and re-ask Lenco for the
 * authoritative status, reusing the same idempotent settle path as checkout.
 */

const STUCK_STATUSES = ["pending", "processing", "fulfillment_failed"] as const;

export type StuckTransaction = {
  id: string;
  amount: number;
  currency: string;
  method_code: string;
  status: string;
  item_type: string;
  item_id: string | null;
  provider_ref: string | null;
  created_at: string;
  updated_at: string;
  buyer_email: string | null;
  phone: string | null;
};

async function assertStaff(supabase: any, userId: string) {
  if (!(await isStaffUser(supabase, userId))) throw new Error("Forbidden: staff only");
}

/** List transactions still awaiting a final outcome, newest first. */
export const listStuckTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StuckTransaction[]> => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .in("status", STUCK_STATUSES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return (data ?? []).map((t: any) => ({
      id: t.id,
      amount: Number(t.amount ?? 0),
      currency: t.currency ?? "ZMW",
      method_code: t.method_code,
      status: t.status,
      item_type: t.item_type,
      item_id: t.item_id ?? null,
      provider_ref: t.provider_ref ?? null,
      created_at: t.created_at,
      updated_at: t.updated_at,
      buyer_email: t.metadata?.email ?? null,
      phone: t.metadata?.phone ?? null,
    }));
  });

async function reconcileOne(tx: any): Promise<string> {
  const { getCollectionStatus } = await import("@/lib/lenco.server");
  const remote = await getCollectionStatus(tx.id, tx.provider_token);
  if (!remote) return tx.status;

  const s = (remote.status ?? "").toLowerCase();
  const isSuccess = s === "successful" || s === "success" || s === "completed";
  const isFailure = s === "failed" || s === "declined" || s === "cancelled";
  if (!isSuccess && !isFailure) return tx.status;

  const { settleTransaction } = await import("@/lib/payments.server");
  return settleTransaction(
    tx.id,
    isSuccess ? "successful" : "failed",
    remote.id ?? null,
    isFailure ? remote.reasonForFailure : null,
  );
}

/**
 * Re-check one stuck transaction against Lenco and settle it if the provider
 * has reached a final state.
 */
export const reconcileTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { transactionId: string }) => {
    if (!d?.transactionId) throw new Error("transactionId is required");
    return { transactionId: d.transactionId };
  })
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tx } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (!tx) throw new Error("Transaction not found");

    const status = await reconcileOne(tx);
    return { id: tx.id, status };
  });

/** Re-check every stuck transaction. Returns a per-status tally. */
export const reconcileAllTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .in("status", STUCK_STATUSES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(100);

    let completed = 0;
    let failed = 0;
    let stillPending = 0;

    for (const tx of data ?? []) {
      try {
        const status = await reconcileOne(tx);
        if (status === "completed") completed += 1;
        else if (status === "failed") failed += 1;
        else stillPending += 1;
      } catch {
        stillPending += 1;
      }
    }

    return { checked: (data ?? []).length, completed, failed, stillPending };
  });

/**
 * Mark an abandoned transaction as failed without contacting Lenco. Used for
 * rows the provider never registered at all (customer closed the prompt).
 */
export const cancelStuckTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { transactionId: string }) => {
    if (!d?.transactionId) throw new Error("transactionId is required");
    return { transactionId: d.transactionId };
  })
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", data.transactionId)
      .in("status", STUCK_STATUSES as unknown as string[]);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "payment.cancel_stuck",
      target_type: "payment_transaction",
      target_id: data.transactionId,
      meta: {},
    });

    return { id: data.transactionId, status: "failed" };
  });
