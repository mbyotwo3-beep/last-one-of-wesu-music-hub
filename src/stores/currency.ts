import { create } from "zustand";

export type Currency = "ZMW" | "USD";

// Default exchange rate: 1 USD = 27 ZMW
const DEFAULT_ZMW_PER_USD = 27;

function getInitialCurrency(): Currency {
  if (typeof window === "undefined") return "ZMW";
  const saved = localStorage.getItem("wesu_currency");
  if (saved === "ZMW" || saved === "USD") return saved;

  // Auto-detect based on user timezone
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes("Lusaka") || tz.includes("Harare")) {
      return "ZMW";
    }
    // Non-Zambian listener defaults to USD
    return "USD";
  } catch {
    return "ZMW";
  }
}

interface CurrencyState {
  currency: Currency;
  zmwPerUsd: number;
  setCurrency: (currency: Currency) => void;
  toggleCurrency: () => void;
  formatPrice: (priceInZmw: number | null | undefined) => string;
}

export const useCurrency = create<CurrencyState>((set, get) => ({
  currency: getInitialCurrency(),
  zmwPerUsd: DEFAULT_ZMW_PER_USD,

  setCurrency: (currency) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("wesu_currency", currency);
    }
    set({ currency });
  },

  toggleCurrency: () => {
    const next = get().currency === "ZMW" ? "USD" : "ZMW";
    if (typeof window !== "undefined") {
      localStorage.setItem("wesu_currency", next);
    }
    set({ currency: next });
  },

  formatPrice: (priceInZmw) => {
    if (priceInZmw === null || priceInZmw === undefined) return "";
    const num = Number(priceInZmw);
    if (num <= 0) return "Free";

    const { currency, zmwPerUsd } = get();
    if (currency === "USD") {
      const usdAmount = num / zmwPerUsd;
      return `$${usdAmount.toFixed(2)}`;
    }
    return `K${num.toFixed(2)}`;
  },
}));
