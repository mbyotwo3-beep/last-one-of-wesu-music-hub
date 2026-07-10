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

        // Ignore replays for already-completed transactions
        if ((row as any).status === "completed") {
          return new Response("OK", { status: 200 });
        }

        const isSuccess =
          event.endsWith(".successful") || tx.status === "successful" || tx.status === "success";
        const isFailure =
          event.endsWith(".failed") || tx.status === "failed" || tx.status === "declined";

        if (isSuccess) {
          const { error } = await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "completed", provider_ref: providerRef ?? null } as any)
            .eq("id", row.id);
          if (error) {
            console.error("[Lenco webhook] Update failed:", error.message);
            return new Response("OK", { status: 200 });
          }
          try {
            await fulfillTransaction(row as any);
          } catch (e) {
            console.error("[Lenco webhook] Fulfillment failed:", e);
          }
        } else if (isFailure) {
          await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "failed", provider_ref: providerRef ?? null } as any)
            .eq("id", row.id);
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
} as any);
