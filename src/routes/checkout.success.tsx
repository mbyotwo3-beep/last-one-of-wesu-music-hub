import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type SuccessSearch = {
  ref?: string;
};

export const Route = createFileRoute("/checkout/success")({
  head: () => ({
    meta: [
      { title: "Payment Successful — Wesu+" },
      { name: "description", content: "Your payment has been processed successfully." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SuccessSearch => ({
    ref: typeof s.ref === "string" ? s.ref : undefined,
  }),
  component: CheckoutSuccessPage,
});

function CheckoutSuccessPage() {
  const { ref } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const { data: transaction, isLoading } = useQuery({
    queryKey: ["transaction", ref],
    queryFn: async () => {
      if (!ref || !user) return null;
      const { data } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("id", ref)
        .maybeSingle();
      return data;
    },
    enabled: !!ref && !!user,
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="size-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Verifying payment...</p>
        </div>
      </div>
    );
  }

  const isSuccess = transaction?.status === "completed";
  const isFailed = transaction?.status === "failed";
  const isPending = transaction?.status === "pending";

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="bg-card border border-white/5 rounded-2xl p-8 text-center">
          {isSuccess ? (
            <>
              <CheckCircle className="size-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-3xl font-bold mb-2">Payment Successful!</h1>
              <p className="text-muted-foreground mb-6">
                Your payment has been processed successfully. Thank you for your purchase.
              </p>
              <div className="bg-secondary/50 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-muted-foreground mb-2">Transaction ID</p>
                <p className="font-mono text-sm">{ref}</p>
              </div>
              <button
                onClick={() => navigate({ to: "/dashboard" })}
                className="px-6 py-3 bg-primary text-obsidian rounded-xl font-semibold hover:brightness-110 transition-all"
              >
                Return to Dashboard
              </button>
            </>
          ) : isFailed ? (
            <>
              <XCircle className="size-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-3xl font-bold mb-2">Payment Failed</h1>
              <p className="text-muted-foreground mb-6">
                Your payment could not be processed. Please try again or contact support.
              </p>
              <div className="bg-secondary/50 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-muted-foreground mb-2">Transaction ID</p>
                <p className="font-mono text-sm">{ref}</p>
              </div>
              <button
                onClick={() => navigate({ to: "/checkout" })}
                className="px-6 py-3 bg-primary text-obsidian rounded-xl font-semibold hover:brightness-110 transition-all"
              >
                Try Again
              </button>
            </>
          ) : isPending ? (
            <>
              <Loader2 className="size-16 text-primary mx-auto mb-4 animate-spin" />
              <h1 className="text-3xl font-bold mb-2">Payment Processing</h1>
              <p className="text-muted-foreground mb-6">
                Your payment is being processed. This may take a few moments.
              </p>
              <div className="bg-secondary/50 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-muted-foreground mb-2">Transaction ID</p>
                <p className="font-mono text-sm">{ref}</p>
              </div>
              <button
                onClick={() => navigate({ to: "/dashboard" })}
                className="px-6 py-3 bg-primary text-obsidian rounded-xl font-semibold hover:brightness-110 transition-all"
              >
                Return to Dashboard
              </button>
            </>
          ) : (
            <>
              <XCircle className="size-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-3xl font-bold mb-2">Transaction Not Found</h1>
              <p className="text-muted-foreground mb-6">
                We couldn't find the transaction details. Please contact support if you believe this is an error.
              </p>
              <button
                onClick={() => navigate({ to: "/dashboard" })}
                className="px-6 py-3 bg-primary text-obsidian rounded-xl font-semibold hover:brightness-110 transition-all"
              >
                Return to Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
