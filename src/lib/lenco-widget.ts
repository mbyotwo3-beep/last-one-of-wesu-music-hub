/**
 * Loads Lenco's hosted inline checkout and opens it.
 * Used when the account's API key can't initiate direct card collections.
 */
declare global {
  interface Window {
    LencoPay?: {
      getPaid: (opts: Record<string, unknown>) => void;
    };
  }
}

const SRC = "https://pay.lenco.co/js/v1/inline.js";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Not in browser"));
    if (window.LencoPay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Lenco checkout")));
      return;
    }
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Lenco checkout"));
    document.body.appendChild(s);
  });
}

export interface LencoWidgetConfig {
  publicKey: string;
  reference: string;
  amount: number;
  currency: string;
  email: string;
}

export async function openLencoCardWidget(
  cfg: LencoWidgetConfig,
  handlers: { onSuccess: () => void; onClose: () => void; onPending?: () => void },
): Promise<void> {
  await loadScript();
  if (!window.LencoPay) throw new Error("Lenco checkout unavailable");
  window.LencoPay.getPaid({
    key: cfg.publicKey,
    reference: cfg.reference,
    email: cfg.email,
    amount: cfg.amount,
    currency: cfg.currency,
    channels: ["card"],
    onSuccess: () => handlers.onSuccess(),
    onClose: () => handlers.onClose(),
    onConfirmationPending: () => (handlers.onPending ?? handlers.onSuccess)(),
  });
}
