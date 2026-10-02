import { createFileRoute } from "@tanstack/react-router";

/**
 * Lenco webhook callback.
 * POST /api/public/lenco-webhook
 *
 * Verifies the `x-lenco-signature` HMAC header, updates the matching
 * payment_transactions row, and calls fulfillTransaction on success.
 */
export const Route = createFileRoute("/api/public/lenco-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("Lenco webhook endpoint active"),
      POST: async ({ request }: { request: Request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-lenco-signature");

        // Dynamic imports — server-only modules must not ship to the client bundle.
        const { verifyWebhookSignature } = await import("@/lib/lenco.server");
        if (!verifyWebhookSignature(rawBody, signature)) {
          console.warn("[Lenco webhook] Invalid signature — rejecting");
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        // Lenco sends: { event: "collection.successful" | "collection.failed" | ..., data: {...} }
        const event: string = payload.event ?? "";
        const tx = payload.data ?? {};
        const reference: string | undefined = tx.reference;
        const providerRef: string | undefined = tx.id;

        if (!reference && !providerRef) {
          console.warn("[Lenco webhook] Missing reference/id");
          return new Response("OK", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { settleTransaction } = await import("@/lib/payments.server");

        // Our `reference` == payment_transactions.id
        let { data: row } = await supabaseAdmin
          .from("payment_transactions")
          .select("*")
          .eq("id", reference ?? "")
          .maybeSingle();

        // Some Lenco webhook payloads omit our reference and only include
        // Lenco's collection id. Fall back to both provider columns so those
        // notifications still settle the right transaction.
        if (!row && providerRef) {
          const byToken = await supabaseAdmin
            .from("payment_transactions")
            .select("*")
            .eq("provider_token", providerRef)
            .maybeSingle();
          row = byToken.data;
        }
        if (!row && providerRef) {
          const byReference = await supabaseAdmin
            .from("payment_transactions")
            .select("*")
            .eq("provider_ref", providerRef)
            .maybeSingle();
          row = byReference.data;
        }

        if (!row) {
          // Unknown reference: don't just log — persist a dead-letter row so
          // lost money is visible instead of silently vanishing.
          console.warn("[Lenco webhook] Unknown reference:", reference);
          try {
            await supabaseAdmin.from("audit_log").insert({
              actor_id: null,
              action: "webhook.unknown_reference",
              target_type: "payment_transaction",
              target_id: String(reference ?? providerRef ?? "unknown"),
              meta: { event, payload: tx },
            } as any);
          } catch {
            /* audit must never break the webhook response */
          }
          return new Response("OK", { status: 200 });
        }

        const isSuccess =
          event.endsWith(".successful") || tx.status === "successful" || tx.status === "success";
        // "cancelled" must count as failure — previously it fell through and
        // the row sat in `pending` forever, invisible to every other path
        // (which all treat cancelled as failed).
        const isFailure =
          event.endsWith(".failed") ||
          event.endsWith(".cancelled") ||
          tx.status === "failed" ||
          tx.status === "declined" ||
          tx.status === "cancelled";
        // Lenco returns "pay-offline" while waiting for the customer to approve
        // the USSD prompt on their phone — leave the row pending, do nothing else.
        const isPending =
          tx.status === "pay-offline" || tx.status === "pending" || event.endsWith(".pending");
        if (isPending && !isSuccess && !isFailure) {
          return new Response("OK", { status: 200 });
        }

        if (isSuccess) {
          // Verify the money before granting anything. Success used to be
          // inferred from the event/status alone, so a replayed or
          // mis-keyed `collection.successful` for a DIFFERENT amount, matched
          // on our transaction reference, would deliver the full purchase
          // regardless of what was actually paid. Compare when the provider
          // tells us; if it does not, fall back to the signature we already
          // verified rather than refusing a legitimate payment.
          const paidAmount = Number(tx.amount ?? NaN);
          const paidCurrency = String(tx.currency ?? "").toUpperCase();
          const mismatch =
            Number.isFinite(paidAmount) &&
            paidAmount > 0 &&
            Number(row.amount) > 0 &&
            Math.abs(paidAmount - Number(row.amount)) > 0.009;
          const currencyMismatch =
            paidCurrency !== "" &&
            String(row.currency ?? "ZMW").toUpperCase() !== "" &&
            paidCurrency !== String(row.currency ?? "ZMW").toUpperCase();

          if (mismatch || currencyMismatch) {
            // Record it loudly and DO NOT fulfil. Support refunds manually.
            try {
              await supabaseAdmin.from("audit_log").insert({
                actor_id: null,
                action: "webhook.amount_mismatch",
                target_type: "payment_transaction",
                target_id: row.id,
                meta: {
                  expected_amount: Number(row.amount),
                  expected_currency: row.currency,
                  received_amount: Number.isFinite(paidAmount) ? paidAmount : null,
                  received_currency: paidCurrency || null,
                  event,
                },
              } as any);
            } catch {
              /* audit must never break the webhook response */
            }
            console.error(
              `[lenco-webhook] amount mismatch for ${row.id}: expected ${row.amount} ${row.currency}, got ${tx.amount} ${tx.currency} — not fulfilling`,
            );
            return new Response("OK", { status: 200 });
          }

          // Idempotent: only the caller that wins pending → completed fulfils.
          await settleTransaction(row.id, "successful", providerRef ?? null);
        } else if (isFailure) {
          await settleTransaction(
            row.id,
            "failed",
            providerRef ?? null,
            tx.reasonForFailure ?? tx.reason ?? null,
          );
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
} as any);
