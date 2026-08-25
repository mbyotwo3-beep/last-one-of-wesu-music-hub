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
 *   header "x-lenco-signature" = hex HMAC-SHA512(raw_body, SHA256(API token))
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";

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
    const detail = (json as any).errors ? ` (${JSON.stringify((json as any).errors)})` : "";
    console.error(`[Lenco] ${path} ${res.status}: ${text.slice(0, 500)}`);
    throw new Error(`Lenco ${path} failed: ${json.message ?? res.statusText}${detail}`);
  }
  if (!json.data) throw new Error(`Lenco ${path} returned no data`);
  return json.data;
}

async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const text = await res.text();
  if (!res.ok) return null;
  try {
    const json = JSON.parse(text) as LencoResponse<T>;
    return json.data ?? null;
  } catch {
    return null;
  }
}

export interface LencoCollectionStatus {
  id?: string;
  reference?: string;
  status: string;
  amount?: number;
  reasonForFailure?: string | null;
}

/**
 * Look up the current state of a collection, by our reference first and then
 * by Lenco's own collection id. Used to settle transactions when the webhook
 * has not (yet) been delivered.
 */
export async function getCollectionStatus(
  reference: string,
  providerId?: string | null,
): Promise<LencoCollectionStatus | null> {
  const byRef = await get<LencoCollectionStatus>(
    `/collections/status/${encodeURIComponent(reference)}`,
  );
  if (byRef?.status) return byRef;
  if (providerId) {
    const byId = await get<LencoCollectionStatus>(`/collections/${encodeURIComponent(providerId)}`);
    if (byId?.status) return byId;
  }
  return null;
}

// ---------- Mobile money ----------

export interface LencoMobileMoneyInput {
  amount: number; // major unit (ZMW)
  reference: string; // your transaction id
  operator: "mtn" | "airtel" | "zamtel";
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
  // Lenco v2 collection fields: `phone`, `operator` short code, `country` optional.
  // Ref: https://lenco-api.readme.io/v2.0/reference/initiate-collection-from-mobile-money
  return post<LencoMobileMoneyResult>("/collections/mobile-money", {
    amount: input.amount,
    reference: input.reference,
    country: "zm",
    operator: input.operator,
    bearer: "merchant",
    phone: normalizeZmPhone(input.phone),
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
 * Constant-time verify a Lenco webhook signature using Lenco's v2 signing
 * scheme: HMAC-SHA512 of the raw payload, keyed by SHA256(API token).
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const apiToken = process.env.LENCO_SECRET_KEY;
  if (!apiToken) {
    console.error("[Lenco webhook] LENCO_SECRET_KEY not configured");
    return false;
  }
  const webhookHashKey = createHash("sha256").update(apiToken).digest("hex");
  const expected = createHmac("sha512", webhookHashKey).update(rawBody).digest("hex");
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
