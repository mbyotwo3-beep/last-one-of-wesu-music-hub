/**
 * Server-only Lenco payments client.
 *
 * Docs: https://docs.lenco.co
 * Base URL:  https://api.lenco.co/access/v2
 *
 * Auth: Bearer <LENCO_SECRET_KEY>
 *
 * Only the two flows we currently use:
 *  - POST /collections/mobile-money   (mtn-zambia | airtel-zambia | zamtel-zambia)
 *  - POST /collections/card           (returns a hosted-checkout URL)
 *
 * Webhook verification (see /api/public/lenco-webhook):
 *   header "x-lenco-signature" = hex HMAC-SHA256(raw_body, LENCO_WEBHOOK_SECRET)
 */
import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_BASE = "https://api.lenco.co/access/v2";

function apiBase(): string {
  return process.env.LENCO_API_URL || DEFAULT_BASE;
}

function secretKey(): string {
  const k = process.env.LENCO_SECRET_KEY;
  if (!k) throw new Error("LENCO_SECRET_KEY is not configured");
  return k;
}

interface LencoResponse<T> {
  status: boolean;
  message?: string;
  data?: T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: LencoResponse<T>;
  try {
    json = JSON.parse(text) as LencoResponse<T>;
  } catch {
    throw new Error(`Lenco returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.status === false) {
    throw new Error(`Lenco ${path} failed: ${json.message ?? res.statusText}`);
  }
  if (!json.data) throw new Error(`Lenco ${path} returned no data`);
  return json.data;
}

// ---------- Mobile money ----------

export interface LencoMobileMoneyInput {
  amount: number; // major unit (ZMW)
  reference: string; // your transaction id
  operator: "mtn-zambia" | "airtel-zambia" | "zamtel-zambia";
  phone: string; // in international format, e.g. 260971234567
  narration?: string;
}

export interface LencoMobileMoneyResult {
  id: string;
  reference: string;
  status: "pending" | "successful" | "failed" | string;
  amount: number;
  fee?: number;
}

export async function initiateMobileMoney(
  input: LencoMobileMoneyInput,
): Promise<LencoMobileMoneyResult> {
  return post<LencoMobileMoneyResult>("/collections/mobile-money", {
    amount: input.amount,
    reference: input.reference,
    country: "zm",
    currency: "ZMW",
    operator: input.operator,
    bearer: "merchant",
    mobileNumber: normalizeZmPhone(input.phone),
    narration: input.narration ?? "Wesu+ purchase",
  });
}

// ---------- Card / hosted checkout ----------

export interface LencoCardInput {
  amount: number;
  reference: string;
  email: string;
  redirectUrl: string;
  narration?: string;
}

export interface LencoCardResult {
  id: string;
  reference: string;
  checkoutUrl: string;
  status: string;
}

export async function initiateCardCheckout(input: LencoCardInput): Promise<LencoCardResult> {
  const raw = await post<any>("/collections/card", {
    amount: input.amount,
    reference: input.reference,
    country: "zm",
    currency: "ZMW",
    bearer: "merchant",
    email: input.email,
    redirectUrl: input.redirectUrl,
    narration: input.narration ?? "Wesu+ purchase",
  });
  // Lenco returns the hosted URL under one of these keys depending on API version
  const checkoutUrl: string | undefined =
    raw.checkoutUrl ?? raw.redirectUrl ?? raw.paymentUrl ?? raw.url;
  if (!checkoutUrl) {
    throw new Error("Lenco card checkout did not return a checkout URL");
  }
  return {
    id: raw.id,
    reference: raw.reference ?? input.reference,
    checkoutUrl,
    status: raw.status ?? "pending",
  };
}

// ---------- Webhook signature ----------

/**
 * Constant-time verify a Lenco webhook signature.
 * Returns true when the signature matches HMAC-SHA256(rawBody, LENCO_WEBHOOK_SECRET).
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.LENCO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Lenco webhook] LENCO_WEBHOOK_SECRET not configured");
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sig = Buffer.from(signature.trim().toLowerCase(), "utf8");
  const exp = Buffer.from(expected, "utf8");
  if (sig.length !== exp.length) return false;
  try {
    return timingSafeEqual(sig, exp);
  } catch {
    return false;
  }
}

// ---------- Utilities ----------

/** Normalize +260 / 0XX / XX numbers to 260XXXXXXXXX. */
export function normalizeZmPhone(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("260")) return digits;
  if (digits.startsWith("0")) return `260${digits.slice(1)}`;
  if (digits.length === 9) return `260${digits}`;
  return digits;
}
