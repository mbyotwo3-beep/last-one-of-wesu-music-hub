import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, CreditCard, Loader2, Smartphone } from "lucide-react";
import { getPaymentMethods, getSubscriptionPlans } from "@/lib/music.functions";
import { initiatePayment } from "@/lib/payments.functions";
import { supabase } from "@/integrations/supabase/client";

const methodsQO = queryOptions({ queryKey: ["methods"], queryFn: () => getPaymentMethods() });
const plansQO = queryOptions({ queryKey: ["plans"], queryFn: () => getSubscriptionPlans() });

interface MobileCheckoutProps {
  planCode?: string;
}

/**
 * Mobile-optimised checkout with large tappable payment cards.
 * Opens paymentUrl in @capacitor/browser when available.
 *
 * Feature: wesu-plus-completion
 */
export function MobileCheckout({ planCode = "premium_monthly" }: MobileCheckoutProps) {
  const { data: methods } = useSuspenseQuery(methodsQO);
  const { data: plans } = useSuspenseQuery(plansQO);

  const plan = plans.find((p: any) => p.code === planCode) ?? plans[0];
  const [selectedCode, setSelectedCode] = useState(methods[0]?.code ?? "");
  const [phone, setPhone] = useState("");
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [pendingTxId, setPendingTxId] = useState<string | null>(null);

  const payFn = useServerFn(initiatePayment);

  const mutation = useMutation({
    mutationFn: payFn,
    onSuccess: async (res) => {
      setPendingTxId(res.transactionId);
      if (res.paymentUrl) {
        try {
          // Use @capacitor/browser when available, fall back to window.open
          const { Browser } = await import("@capacitor/browser");
          await Browser.open({ url: res.paymentUrl });
          // Check tx status when browser closes
          Browser.addListener("browserFinished", () => recheckStatus(res.transactionId));
        } catch {
          window.open(res.paymentUrl, "_blank");
        }
      } else if ((res as any).message) {
        setResultMsg((res as any).message);
      }
    },
    onError: (e: Error) => setResultMsg(e.message),
  });

  async function recheckStatus(txId: string) {
    const { data } = await supabase
      .from("payment_transactions")
      .select("status")
      .eq("id", txId)
      .single();
    if (data?.status === "completed") {
      setResultMsg("Payment successful! Your subscription is now active.");
    } else {
      setResultMsg(`Payment status: ${data?.status ?? "unknown"}. Please check your account.`);
    }
  }

  if (!plan) return <div className="p-6 text-muted-foreground text-sm">No plans available.</div>;

  const selectedMethod = methods.find((m: any) => m.code === selectedCode);
  const isMobileMoney = selectedMethod?.category !== "card";

  return (
    <div className="pb-8 px-4">
      <div className="pt-4 pb-6">
        <h1 className="text-xl font-bold">Checkout</h1>
        <p className="text-muted-foreground text-sm mt-1">Complete your purchase securely</p>
      </div>

      {/* Order summary */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-6">
        <p className="text-sm text-muted-foreground mb-1">Wesu+ {plan.name}</p>
        <p className="text-2xl font-bold text-primary">ZMW {Number(plan.price_zmw).toFixed(2)}</p>
      </div>

      {/* Payment method cards — large tappable (≥64pt) */}
      <div className="space-y-3 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Payment Method
        </h2>
        {methods.map((m: any) => (
          <button
            key={m.code}
            onClick={() => setSelectedCode(m.code)}
            className={`w-full min-h-[64px] flex items-center gap-4 px-4 rounded-2xl border text-left transition-all ${
              selectedCode === m.code
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:border-primary/40"
            }`}
          >
            {m.category === "card" ? (
              <CreditCard className="size-6 shrink-0" />
            ) : (
              <Smartphone className="size-6 shrink-0" />
            )}
            <span className="font-medium text-sm">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Phone number for mobile money */}
      {isMobileMoney && (
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Mobile Money Number</label>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0977 123 456"
            className="w-full min-h-[44px] px-4 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/50"
          />
        </div>
      )}

      {/* Result message */}
      {resultMsg && (
        <div className="mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm">
          {resultMsg}
        </div>
      )}

      {/* Pay button */}
      <button
        disabled={mutation.isPending || !selectedCode}
        onClick={() =>
          mutation.mutate({
            data: {
              
              method_code: selectedCode,
              item_type: "subscription",
              item_id: plan.id,
              phone: phone || undefined,
            },
          })
        }
        className="w-full min-h-[56px] bg-primary text-primary-foreground rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {mutation.isPending ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Check className="size-5" />
        )}
        Pay ZMW {Number(plan.price_zmw).toFixed(2)}
      </button>
    </div>
  );
}
