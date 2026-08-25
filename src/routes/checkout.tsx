import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { CreditCard, Smartphone, Check, CheckCircle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  getPaymentMethods,
  getPurchasableItem,
} from "@/lib/music.functions";
import { initiatePayment, verifyPayment } from "@/lib/payments.functions";
import { useAuth } from "@/hooks/use-auth";

const methodsQO = queryOptions({ queryKey: ["methods"], queryFn: () => getPaymentMethods() });

type CheckoutSearch = {
  item?: "song" | "album";
  id?: string;
};

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Wesu+" },
      { name: "description", content: "Complete your purchase on Wesu+." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): CheckoutSearch => {
    const item = s.item === "song" || s.item === "album" ? s.item : undefined;
    const out: CheckoutSearch = {};
    if (item) out.item = item;
    if (typeof s.id === "string") out.id = s.id;
    return out;
  },
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(methodsQO);
  },
  component: CheckoutRoute,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function CheckoutRoute() {
  const [isMounted, setIsMounted] = useState(false);
  const search = Route.useSearch();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Subscriptions are temporarily disabled — only track/album purchases are supported.
  // Keep every hook above this guard so hydration cannot change hook order.
  if (!isMounted) return null;
  if (!search.item || !search.id) return <MissingCheckout />;
  return <CheckoutPage />;
}

function MissingCheckout() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">Choose a song or album to buy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This checkout link is incomplete. Your payment has not been started.
        </p>
        <Link
          to="/library"
          className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
        >
          Go to Library
        </Link>
      </div>
    </div>
  );
}

function CheckoutPage() {
  const search = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: methods } = useSuspenseQuery(methodsQO);

  const { data: purchasable } = useQuery({
    queryKey: ["purchasable", search.item, search.id],
    queryFn: () =>
      getPurchasableItem({ data: { item_type: search.item!, id: search.id! } }),
    enabled: !!search.item && !!search.id,
  });

  const [selectedMethodCode, setSelectedMethodCode] = useState(methods[0]?.code ?? "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: window.location.pathname + window.location.search } });
  }, [user, loading, navigate]);

  const payFn = useServerFn(initiatePayment);
  const mutation = useMutation({
    mutationFn: payFn,
    onSuccess: (res: any) => {
      if (res?.paymentUrl) {
        // Card / hosted checkout — redirect to Lenco
        window.location.href = res.paymentUrl;
        return;
      }
      if (res?.widget) {
        // Card via Lenco's hosted inline widget (account not enabled for
        // server-side direct card collections).
        import("@/lib/lenco-widget")
          .then(({ openLencoCardWidget }) =>
            openLencoCardWidget(res.widget, {
              onSuccess: () =>
                navigate({ to: "/checkout/success", search: { ref: res.transactionId } }),
              onClose: () => toast.info("Card payment cancelled."),
            }),
          )
          .catch((err: Error) => {
            setResultMsg(err.message);
            toast.error(`Payment failed: ${err.message}`);
          });
        return;
      }
      if (res?.transactionId) {
        // Mobile money — redirect to success page to poll for status
        setPendingTransactionId(res.transactionId);
        setResultMsg(null);
        return;
      }
      const successMsg = res?.message ?? "Payment started.";
      setResultMsg(successMsg);
      toast.success(successMsg);
    },
    onError: (e: Error) => {
      setResultMsg(e.message);
      toast.error(`Payment failed: ${e.message}`);
    },
  });

  if (loading || !user) return null;

  // Resolve line item
  let lineName = "";
  let linePrice = 0;
  let itemType: "song" | "album" = "song";
  let itemId: string | undefined;

  if (purchasable) {
    lineName = `${(purchasable as any).title}${(purchasable as any).artist?.name ? ` — ${(purchasable as any).artist.name}` : ""}`;
    linePrice = Number((purchasable as any).price ?? 0);
    itemType = search.item!;
    itemId = (purchasable as any).id;
  } else if (!purchasable) {
    return <div className="p-12 text-center text-muted-foreground">Loading item…</div>;
  } else {
    return null;
  }

  if (pendingTransactionId) {
    return (
      <MobileMoneyPaymentStatus
        transactionId={pendingTransactionId}
        itemType={itemType}
        itemId={itemId!}
        onRetry={() => setPendingTransactionId(null)}
      />
    );
  }

  const selectedMethod = methods.find((m) => m.code === selectedMethodCode);
  const isCard = selectedMethod?.category === "card";
  const disabled =
    mutation.isPending ||
    !selectedMethodCode ||
    !itemId ||
    (!isCard && !phoneNumber.trim()) ||
    linePrice <= 0;

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Checkout</h1>
        <p className="text-muted-foreground mb-8">Complete your purchase securely</p>

        <div className="bg-card border border-white/5 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
          <div className="flex justify-between items-center py-3 border-b border-white/5">
            <span className="text-muted-foreground">{lineName}</span>
            <span className="font-semibold">ZMW {linePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center py-3">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold text-primary">ZMW {linePrice.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-card border border-white/5 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Payment Method</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {methods.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMethodCode(m.code)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedMethodCode === m.code
                    ? "border-primary bg-primary/10"
                    : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  {m.category === "card" ? (
                    <CreditCard className="size-5" />
                  ) : (
                    <Smartphone className="size-5" />
                  )}
                  <span className="font-medium text-sm">{m.label}</span>
                </div>
              </button>
            ))}
          </div>

          {!isCard ? (
            <div className="space-y-4">
              <label className="block text-sm font-medium">Mobile Money Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 0977 123 456"
                className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
              />
              <p className="text-xs text-muted-foreground">
                You'll receive a prompt on your phone to authorize this payment.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Card payments are processed securely by Lenco. You'll be redirected after confirming.
            </p>
          )}
        </div>

        {resultMsg && (
          <div className="mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            {resultMsg}
          </div>
        )}

        <button
          disabled={disabled}
          onClick={() =>
            mutation.mutate({
              data: {
                method_code: selectedMethodCode,
                item_type: itemType,
                item_id: itemId!,
                phone: phoneNumber || undefined,
              },
            })
          }
          className="w-full py-4 bg-primary text-obsidian rounded-2xl font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer hover:scale-105"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Pay ZMW {linePrice.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

function MobileMoneyPaymentStatus({
  transactionId,
  itemType,
  itemId,
  onRetry,
}: {
  transactionId: string;
  itemType: "song" | "album";
  itemId: string;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const verifyFn = useServerFn(verifyPayment);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const { data: verification, refetch } = useQuery({
    queryKey: ["payment-verification", transactionId],
    queryFn: () => verifyFn({ data: { transactionId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.transaction?.status ?? query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 3000;
    },
    refetchIntervalInBackground: true,
    retry: 2,
  });

  const status = verification?.transaction?.status ?? verification?.status ?? "pending";
  const isSuccess = status === "completed";
  const isFailed = status === "failed";

  useEffect(() => {
    if (isSuccess || isFailed) return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isSuccess, isFailed]);

  const viewPurchase = () => {
    if (itemType === "album") {
      navigate({ to: "/albums/$id", params: { id: itemId } });
      return;
    }
    navigate({ to: "/library" });
  };

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center">
        {isSuccess ? (
          <>
            <CheckCircle className="mx-auto mb-4 size-16 text-green-500" />
            <h1 className="text-3xl font-bold">Payment successful</h1>
            <p className="mt-2 text-muted-foreground">Your {itemType} is now in your library.</p>
            <button
              onClick={viewPurchase}
              className="mt-6 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
            >
              {itemType === "album" ? "View Album" : "Go to Library"}
            </button>
          </>
        ) : isFailed ? (
          <>
            <XCircle className="mx-auto mb-4 size-16 text-red-500" />
            <h1 className="text-3xl font-bold">Payment failed</h1>
            <p className="mt-2 text-muted-foreground">
              {verification?.reason ?? "Lenco could not complete this payment. Please try again."}
            </p>
            <button
              onClick={onRetry}
              className="mt-6 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
            >
              Try Again
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-4 size-16 animate-spin text-primary" />
            <h1 className="text-3xl font-bold">Approve the payment on your phone</h1>
            <p className="mt-2 text-muted-foreground">
              Your mobile-money request is active. Keep this page open while Lenco confirms the result.
              {elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : ""}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-6 rounded-xl border border-border px-6 py-3 font-semibold hover:bg-accent"
            >
              Check payment status
            </button>
          </>
        )}
      </div>
    </div>
  );
}
