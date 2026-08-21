import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { verifyPayment } from "@/lib/payments.functions";

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
  const verifyFn = useServerFn(verifyPayment);

  const { data: transaction, isLoading } = useQuery({
    queryKey: ["transaction", ref],
    queryFn: async () => {
      if (!ref || !user) return null;
      // Ask the server to reconcile with Lenco directly. This settles mobile
      // money as soon as the customer approves the prompt on their phone,
      // without depending on webhook delivery.
      try {
        const res: any = await verifyFn({ data: { transactionId: ref } });
        if (res?.transaction) return res.transaction;
      } catch {
        // fall through to a plain read
      }
      const { data } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("id", ref)
        .maybeSingle();
      return data;
    },
    enabled: !!ref && !!user,
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.status;
      if (status === "completed" || status === "failed") return false;
      return 3000;
    },
    refetchIntervalInBackground: true,
  });

  const { data: receiptItem } = useQuery({
    queryKey: ["receipt-item", transaction?.item_type, transaction?.item_id],
    enabled: !!transaction?.item_id && !!transaction?.item_type,
    queryFn: async () => {
      const t = transaction as any;
      if (t.item_type === "song") {
        const { data } = await supabase
          .from("songs")
          .select("id,title,price,artists:artist_id(id,name)")
          .eq("id", t.item_id).maybeSingle();
        return data;
      }
      if (t.item_type === "album") {
        const { data } = await supabase
          .from("albums")
          .select("id,title,price,artists:artist_id(id,name)")
          .eq("id", t.item_id).maybeSingle();
        return data;
      }
      return null;
    },
  });

  const [pollElapsed, setPollElapsed] = useState(0);
  useEffect(() => {
    if (transaction?.status !== "pending") return;
    const t = setInterval(() => setPollElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [transaction?.status]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: window.location.pathname + window.location.search } });
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
  const tx: any = transaction;

  const StatusBadge = () => {
    if (isSuccess) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-500 border border-green-500/20">Completed</span>;
    if (isFailed) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-500 border border-red-500/20">Failed</span>;
    if (isPending) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/20">Pending</span>;
    return null;
  };

  const handleSuccessRedirect = () => {
    // Redirect to the purchased item or library
    if (tx?.item_type === "song" && tx?.item_id) {
      navigate({ to: "/songs/$id", params: { id: tx.item_id } });
    } else if (tx?.item_type === "album" && tx?.item_id) {
      navigate({ to: "/albums/$id", params: { id: tx.item_id } });
    } else {
      navigate({ to: "/library" });
    }
  };

  const handleFailureRedirect = () => {
    // Redirect back to checkout to retry
    if (tx?.item_type === "song" && tx?.item_id) {
      navigate({ to: "/checkout", search: { item: "song", id: tx.item_id } });
    } else if (tx?.item_type === "album" && tx?.item_id) {
      navigate({ to: "/checkout", search: { item: "album", id: tx.item_id } });
    } else {
      navigate({ to: "/browse" });
    }
  };

  const Receipt = () =>
    !tx ? null : (
      <div className="bg-secondary/40 rounded-xl p-5 text-left space-y-3 mb-6 border border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Receipt</h3>
          <StatusBadge />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {(receiptItem as any)?.title ?? tx.item_type ?? "Item"}
            {(receiptItem as any)?.artists?.name ? ` — ${(receiptItem as any).artists.name}` : ""}
          </span>
          <span className="font-semibold">{tx.currency} {Number(tx.amount).toFixed(2)}</span>
        </div>
        <div className="border-t border-border pt-3 grid grid-cols-2 gap-y-2 text-xs">
          <span className="text-muted-foreground">Payment method</span>
          <span className="text-right font-medium">{tx.method_code}</span>
          <span className="text-muted-foreground">Date</span>
          <span className="text-right">{new Date(tx.created_at).toLocaleString()}</span>
          <span className="text-muted-foreground">Transaction ID</span>
          <span className="text-right font-mono truncate">{tx.id}</span>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="bg-card border border-white/5 rounded-2xl p-8 text-center">
          {isSuccess ? (
            <>
              <CheckCircle className="size-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-3xl font-bold mb-2">Payment Successful!</h1>
              <p className="text-muted-foreground mb-6">
                Thank you for your purchase — your track is now unlocked.
              </p>
              <Receipt />
              <button
                onClick={handleSuccessRedirect}
                className="px-6 py-3 bg-primary text-obsidian rounded-xl font-semibold hover:brightness-110 transition-all"
              >
                Go to {tx?.item_type === "album" ? "Album" : "Song"}
              </button>
            </>
          ) : isFailed ? (
            <>
              <XCircle className="size-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-3xl font-bold mb-2">Payment Failed</h1>
              <p className="text-muted-foreground mb-6">
                Your payment could not be processed. Please try again or contact support.
              </p>
              <Receipt />
              <button
                onClick={handleFailureRedirect}
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
                Waiting for confirmation from Lenco… If you paid via mobile money, approve the prompt on your phone.
                {pollElapsed > 0 && ` (${pollElapsed}s)`}
              </p>
              <Receipt />
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

