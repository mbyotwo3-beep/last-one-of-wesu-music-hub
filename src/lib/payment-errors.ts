/**
 * Turning provider failures into something a buyer can act on.
 *
 * The raw Lenco error that used to reach the browser was built like
 * `Lenco /collections/mobile-money failed: <message> [code <errorCode>]
 * ({"json":"payload"})` — a provider API path and a JSON body shown to
 * someone standing at a mobile-money prompt. It was neither safe to publish
 * nor useful to act on.
 *
 * The raw text is still logged server-side; only the message the buyer sees
 * comes from this table.
 */

/** Shown when nothing more specific matched. */
const GENERIC = "We couldn't start that payment. Please try again in a moment.";

/**
 * A mobile-money error always means the buyer's money or their phone
 * problem, not ours — so the wording points at what they can do.
 */
export function friendlyPaymentError(raw: unknown): string {
  const text = typeof raw === "string" ? raw : ((raw as Error)?.message ?? "");
  const m = text.toLowerCase();

  // Ordered: the specific reasons first, because they overlap heavily in the
  // provider's wording.
  if (m.includes("insufficient") || m.includes("balance") || m.includes("not enough")) {
    return "You don't have enough balance in your mobile money account. Top up and try again.";
  }
  if (
    (m.includes("invalid") && m.includes("phone")) ||
    m.includes("invalid msisdn") ||
    m.includes("msisdn")
  ) {
    return "That mobile money number isn't valid. Check it and try again.";
  }
  if (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("econnrefused")
  ) {
    return "Your connection dropped while starting the payment. Check your data or Wi-Fi and try again.";
  }
  if (m.includes("declined") || m.includes("rejected") || m.includes("cancel")) {
    return "That payment was declined. Please try again or use a different payment method.";
  }
  if (
    m.includes("merchant") ||
    m.includes("not configured") ||
    m.includes("api key") ||
    m.includes("unauthorized") ||
    m.includes("forbidden")
  ) {
    // A configuration problem is ours, not theirs — say so without leaking.
    return "Payments are temporarily unavailable. Please try again shortly.";
  }
  if (m.includes("limit") || m.includes("exceed")) {
    return "That payment is above the limit for this method. Try a smaller amount or another method.";
  }
  if (m.includes("duplicate") || m.includes("already")) {
    return "This payment was already started. Check your phone for the payment prompt.";
  }
  return GENERIC;
}
