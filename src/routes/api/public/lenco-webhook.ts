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
        const { fulfillTransaction } = await import("@/lib/payments.server");

        // Our `reference` == payment_transactions.id
        const { data: row } = await supabaseAdmin
          .from("payment_transactions")
          .select("*")
          .eq("id", reference ?? "")
          .maybeSingle();

        if (!row) {
          console.warn("[Lenco webhook] Unknown reference:", reference);
          return new Response("OK", { status: 200 });
        }

        const isSuccess =
          event.endsWith(".successful") || tx.status === "successful" || tx.status === "success";
        const isFailure =
          event.endsWith(".failed") || tx.status === "failed" || tx.status === "declined";
        // Lenco returns "pay-offline" while waiting for the customer to approve
        // the USSD prompt on their phone — leave the row pending, do nothing else.
        const isPending =
          tx.status === "pay-offline" ||
          tx.status === "pending" ||
          event.endsWith(".pending");
        if (isPending && !isSuccess && !isFailure) {
          return new Response("OK", { status: 200 });
        }

        if (isSuccess) {
          // IDEMPOTENT transition: only proceed when we actually flip pending → completed.
          // If two webhooks race, only one wins the update and calls fulfillTransaction.
          const { data: claimed, error: claimErr } = await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "completed", provider_ref: providerRef ?? null } as any)
            .eq("id", row.id)
            .eq("status", "pending")
            .select()
            .maybeSingle();

          if (claimErr) {
            console.error("[Lenco webhook] Claim failed:", claimErr.message);
            return new Response("OK", { status: 200 });
          }

          if (!claimed) {
            // Already processed by a previous delivery — nothing more to do.
            return new Response("OK", { status: 200 });
          }

          try {
            await fulfillTransaction(claimed as any);
          } catch (e) {
            console.error("[Lenco webhook] Fulfillment failed:", e);
            // Mark as failed so the user can retry from the checkout success page.
            await supabaseAdmin
              .from("payment_transactions")
              .update({ status: "failed" } as any)
              .eq("id", row.id);
          }
        } else if (isFailure) {
          await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "failed", provider_ref: providerRef ?? null } as any)
            .eq("id", row.id)
            .eq("status", "pending");
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
} as any);
