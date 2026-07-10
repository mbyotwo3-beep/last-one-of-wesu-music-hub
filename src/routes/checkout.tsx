import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { CreditCard, Smartphone, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getPaymentMethods,
  getSubscriptionPlans,
  getPurchasableItem,
} from "@/lib/music.functions";
import { initiatePayment } from "@/lib/payments.functions";
import { useAuth } from "@/hooks/use-auth";
import { usePlatform } from "@/hooks/use-platform";
import { MobileCheckout } from "@/components/mobile/screens/MobileCheckout";

const methodsQO = queryOptions({ queryKey: ["methods"], queryFn: () => getPaymentMethods() });
const plansQO = queryOptions({ queryKey: ["plans"], queryFn: () => getSubscriptionPlans() });

type CheckoutSearch = {
  plan: string;
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
    return {
      plan: typeof s.plan === "string" ? s.plan : "premium_monthly",
      item,
      id: typeof s.id === "string" ? s.id : undefined,
    };
  },
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(methodsQO);
    context.queryClient.ensureQueryData(plansQO);
  },
  component: CheckoutRoute,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function CheckoutRoute() {
  const platform = usePlatform();
  const { plan: planCode } = Route.useSearch();
  return platform === "native" ? <MobileCheckout planCode={planCode} /> : <CheckoutPage />;
}

function CheckoutPage() {
  const search = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: methods } = useSuspenseQuery(methodsQO);
  const { data: plans } = useSuspenseQuery(plansQO);

  const isPurchase = !!(search.item && search.id);
  const { data: purchasable } = useQuery({
    queryKey: ["purchasable", search.item, search.id],
    queryFn: () =>
      getPurchasableItem({ data: { item_type: search.item!, id: search.id! } }),
    enabled: isPurchase,
  });

  const plan = plans.find((p) => p.code === search.plan) ?? plans[0];

  const [selectedMethodCode, setSelectedMethodCode] = useState(methods[0]?.code ?? "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
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
      const successMsg = res?.message ??
          (res?.pendingUssd
            ? "Check your phone and approve the payment prompt."
            : "Payment started.");
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
  let itemType: "song" | "album" | "subscription" = "subscription";
  let itemId: string | undefined;

  if (isPurchase && purchasable) {
    lineName = `${(purchasable as any).title}${(purchasable as any).artist?.name ? ` — ${(purchasable as any).artist.name}` : ""}`;
    linePrice = Number((purchasable as any).price ?? 0);
    itemType = search.item!;
    itemId = (purchasable as any).id;
  } else if (!isPurchase && plan) {
    lineName = `Wesu+ ${plan.name}`;
    linePrice = Number(plan.price_zmw);
    itemType = "subscription";
    itemId = plan.id;
  } else if (isPurchase && !purchasable) {
    return <div className="p-12 text-center text-muted-foreground">Loading item…</div>;
  } else {
    return null;
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
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedMethodCode === m.code
                    ? "border-primary bg-primary/10"
                    : "border-white/10 hover:border-white/20 bg-white/5"
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
          className="w-full py-4 bg-primary text-obsidian rounded-2xl font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
