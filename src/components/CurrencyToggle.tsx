import { useCurrency } from "@/stores/currency";
import { DollarSign } from "lucide-react";

export function CurrencyToggle() {
  const currency = useCurrency((s) => s.currency);
  const toggleCurrency = useCurrency((s) => s.toggleCurrency);

  return (
    <button
      type="button"
      onClick={toggleCurrency}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary border border-border text-xs font-semibold hover:border-primary/50 transition-all cursor-pointer"
      title={`Current currency: ${currency}. Click to switch.`}
      aria-label="Toggle currency"
    >
      <DollarSign className="size-3 text-primary" />
      <span>{currency}</span>
    </button>
  );
}
