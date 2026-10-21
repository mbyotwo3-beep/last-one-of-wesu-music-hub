import { create } from "zustand";

export type Currency = "ZMW" | "USD";

// Default exchange rate: 1 USD = 27 ZMW
const DEFAULT_ZMW_PER_USD = 27;

function getInitialCurrency(): Currency {
  if (typeof window === "undefined") return "ZMW";
  const saved = localStorage.getItem("wesu_currency");
  if (saved === "ZMW" || saved === "USD") return saved;
  // Default to ZMW
  return "ZMW";
}

interface CurrencyState {
  currency: Currency;
  zmwPerUsd: number;
  setCurrency: (currency: Currency) => void;
  toggleCurrency: () => void;
  /** Hydrated from the live FX feed at boot; 27 until then. */
  setZmwPerUsd: (rate: number) => void;
  formatPrice: (priceInZmw: number | null | undefined) => string;
}

export const useCurrency = create<CurrencyState>((set, get) => {
  // formatPrice reads `get()` at call time, so it always formats with the
  // CURRENT currency and rate. But zustand subscriptions compare by identity:
  // a stable function means components subscribed to `s.formatPrice` never
  // re-render when the currency flips — they kept showing "K20.00" while the
  // toggle read "USD" (observed live on /). Recreating the function on every
  // state change makes its identity the subscription signal, and no consumer
  // needs to change.
  const makeFormat = (): CurrencyState["formatPrice"] => (priceInZmw) => {
    if (priceInZmw === null || priceInZmw === undefined) return "";
    const num = Number(priceInZmw);
    if (num <= 0) return "Free";
    const { currency, zmwPerUsd } = get();
    if (currency === "USD") {
      const usdAmount = num / zmwPerUsd;
      return `$${usdAmount.toFixed(2)}`;
    }
    return `K${num.toFixed(2)}`;
  };

  return {
    currency: getInitialCurrency(),
    zmwPerUsd: DEFAULT_ZMW_PER_USD,
    // Independent initial call: the format itself is fresh, only its identity
    // needs to change on updates below.
    formatPrice: makeFormat(),

    setCurrency: (currency) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("wesu_currency", currency);
      }
      set({ currency, formatPrice: makeFormat() });
    },

    toggleCurrency: () => {
      const next = get().currency === "ZMW" ? "USD" : "ZMW";
      if (typeof window !== "undefined") {
        localStorage.setItem("wesu_currency", next);
      }
      set({ currency: next, formatPrice: makeFormat() });
    },

    setZmwPerUsd: (rate) => {
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        set({ zmwPerUsd: rate, formatPrice: makeFormat() });
      }
    },
  };
});
