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
