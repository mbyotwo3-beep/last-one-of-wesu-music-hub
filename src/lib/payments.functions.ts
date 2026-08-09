import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Poll Lenco for the authoritative state of one of the caller's own
 * transactions and settle it. This is the fallback (and, in practice, the
 * primary) completion path for mobile money: the customer approves the USSD
 * prompt on their phone and the checkout page verifies the result directly
 * instead of waiting on webhook delivery.
 */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { transactionId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", data.transactionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!tx) return { status: "not_found" as const };
    if (tx.status !== "pending") {
      return { status: tx.status as string, transaction: tx };
    }

    const { getCollectionStatus } = await import("@/lib/lenco.server");
    const remote = await getCollectionStatus(tx.id, (tx as any).provider_token);

    if (!remote) return { status: "pending" as const, transaction: tx };

    const s = (remote.status ?? "").toLowerCase();
    const isSuccess = s === "successful" || s === "success" || s === "completed";
    const isFailure = s === "failed" || s === "declined" || s === "cancelled";

    if (!isSuccess && !isFailure) {
      return { status: "pending" as const, transaction: tx, reason: remote.reasonForFailure };
    }

    const { settleTransaction } = await import("@/lib/payments.server");
    const settled = await settleTransaction(
      tx.id,
      isSuccess ? "successful" : "failed",
      remote.id ?? null,
    );

    const { data: fresh } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", tx.id)
      .maybeSingle();

    return { status: settled, transaction: fresh ?? tx, reason: remote.reasonForFailure };
  });

/**
 * Initiate a Lenco collection.
 *
 * - Looks up the authoritative price server-side (never trusts client amount).
 * - Records a pending `payment_transactions` row.
 * - Routes to Lenco mobile-money or card checkout based on the selected method.
 * - Returns either `paymentUrl` (card, hosted redirect) or `pendingUssd: true`
 *   (mobile money — user completes on their phone; webhook fulfills).
 *
 * Required env vars: LENCO_SECRET_KEY, LENCO_WEBHOOK_SECRET, APP_URL (optional).
 */
export const initiatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      method_code: string;
      item_type: "song" | "album" | "subscription";
      item_id?: string;
      phone?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    if (!data.item_id) throw new Error("item_id is required");

    // -- Authoritative price lookup (RLS-safe: uses caller's client) --
    let authoritativeAmount: number | null = null;
    if (data.item_type === "song") {
      const { data: row } = await supabase
        .from("songs")
        .select("price,title")
        .eq("id", data.item_id)
        .maybeSingle();
      authoritativeAmount = row?.price != null ? Number(row.price) : null;
    } else if (data.item_type === "album") {
      const { data: row } = await supabase
        .from("albums")
        .select("price,title")
        .eq("id", data.item_id)
        .maybeSingle();
      authoritativeAmount = row?.price != null ? Number(row.price) : null;
    } else if (data.item_type === "subscription") {
      const { data: row } = await supabase
        .from("subscription_plans")
        .select("price_zmw,is_active")
        .eq("id", data.item_id)
        .maybeSingle();
      if (row && (row as any).is_active === false) throw new Error("Plan is not active");
      authoritativeAmount = row?.price_zmw != null ? Number(row.price_zmw) : null;
    }
    if (
      authoritativeAmount == null ||
      !Number.isFinite(authoritativeAmount) ||
      authoritativeAmount <= 0
    ) {
      throw new Error("Unable to determine price for the requested item");
    }
    const amount = authoritativeAmount;

    // -- Look up the payment method (Lenco operator or card) --
    const { data: method } = await supabase
      .from("payment_methods")
      .select("code,category,lenco_operator,is_enabled")
      .eq("code", data.method_code)
      .maybeSingle();
    if (!method || (method as any).is_enabled === false) {
      throw new Error("Selected payment method is not available");
    }
    const isMobile = (method as any).category === "mobile_money";
    const isCard = (method as any).category === "card";
    if (!isMobile && !isCard) throw new Error("Unsupported payment method category");
    if (isMobile && !(method as any).lenco_operator) {
      throw new Error("Payment method is not mapped to a Lenco operator");
    }
    if (isMobile && !data.phone) {
      throw new Error("Phone number is required for mobile money");
    }

    // -- Record the pending transaction --
    const { data: tx, error: insertError } = await supabase
      .from("payment_transactions")
      .insert({
        user_id: userId,
        amount,
        currency: "ZMW",
        method_code: data.method_code,
        provider: "lenco",
        status: "pending",
        item_type: data.item_type,
        item_id: data.item_id,
        metadata: { phone: data.phone ?? null },
      })
      .select()
      .single();
    if (insertError || !tx) throw new Error(insertError?.message ?? "Insert failed");

    const { initiateMobileMoney, initiateCardCheckout, normalizeZmPhone } = await import(
      "@/lib/lenco.server"
    );

    const appUrl = process.env.APP_URL ?? "https://www.wesuplusly.com";

    if (isMobile) {
      try {
        const result = await initiateMobileMoney({
          amount,
          reference: tx.id,
          operator: (method as any).lenco_operator,
          phone: normalizeZmPhone(data.phone!),
          narration: `Wesu+ ${data.item_type}`,
        });
        await supabase
          .from("payment_transactions")
          .update({ provider_token: result.id, provider_ref: result.reference } as any)
          .eq("id", tx.id);
        return {
          transactionId: tx.id,
          pendingUssd: true,
          message: "Check your phone and approve the payment prompt to complete this purchase.",
        };
      } catch (e: any) {
        await supabase
          .from("payment_transactions")
          .update({ status: "failed" } as any)
          .eq("id", tx.id);
        throw new Error(e?.message ?? "Failed to start mobile money payment");
      }
    }

    // Card
    const email = (claims?.email as string | undefined) ?? "buyer@wesuplusly.com";
    try {
      const result = await initiateCardCheckout({
        amount,
        reference: tx.id,
        email,
        redirectUrl: `${appUrl}/checkout/success?ref=${tx.id}`,
        narration: `Wesu+ ${data.item_type}`,
      });
      await supabase
        .from("payment_transactions")
        .update({ provider_token: result.id, provider_ref: result.reference } as any)
        .eq("id", tx.id);
      return {
        transactionId: tx.id,
        paymentUrl: result.checkoutUrl,
      };
    } catch (e: any) {
      // Most Lenco accounts are not enabled for server-side direct card
      // collections ("The API key does not have permission to initiate direct
      // card collections"). Fall back to Lenco's hosted inline widget, which
      // only needs the publishable key. Fulfilment still happens by webhook.
      const publicKey = process.env.LENCO_PUBLIC_KEY;
      if (publicKey) {
        console.warn(`[Lenco] direct card unavailable, using inline widget: ${e?.message}`);
        return {
          transactionId: tx.id,
          widget: {
            publicKey,
            reference: tx.id,
            amount,
            currency: "ZMW",
            email,
          },
        };
      }
      await supabase
        .from("payment_transactions")
        .update({ status: "failed" } as any)
        .eq("id", tx.id);
      throw new Error(e?.message ?? "Failed to start card payment");
    }
  });
