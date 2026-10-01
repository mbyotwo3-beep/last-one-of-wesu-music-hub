import { describe, expect, it } from "vitest";
import { friendlyPaymentError } from "@/lib/payment-errors";

/**
 * A buyer at a mobile-money prompt must never see a provider API path or a
 * JSON payload. These lock the wording AND the absence of the raw detail.
 */
describe("friendly payment errors", () => {
  it("never leaks provider internals, for any input", () => {
    const nasty = [
      'Lenco /collections/mobile-money failed: bad request [code 400] ({"error":"secret_key"} )',
      "Error: connect ECONNREFUSED 10.0.0.1:443",
      "https://api.lenco.io/v1/collections - 500",
      '{"message":"invalid api key sk_live_abc123"}',
      "LENCO_SECRET_KEY rejected",
    ];
    for (const raw of nasty) {
      const out = friendlyPaymentError(raw);
      expect(out).not.toMatch(/lenco/i);
      expect(out).not.toMatch(/api[_ -]?key|secret/i);
      expect(out).not.toMatch(/https?:/i);
      expect(out).not.toMatch(/\{|\}|code \d+/i);
      expect(out.length).toBeGreaterThan(10);
    }
  });

  it("points the buyer at the thing they can actually fix", () => {
    expect(friendlyPaymentError("insufficient funds")).toMatch(/balance/i);
    expect(friendlyPaymentError("Invalid MSISDN supplied")).toMatch(/mobile money number/i);
    expect(friendlyPaymentError("socket timeout")).toMatch(/connection/i);
    expect(friendlyPaymentError("request declined by issuer")).toMatch(/declined/i);
    expect(friendlyPaymentError("amount exceeds daily limit")).toMatch(/limit/i);
    expect(friendlyPaymentError("duplicate reference")).toMatch(/already started/i);
  });

  it("blames us, not the buyer, for a configuration failure", () => {
    expect(friendlyPaymentError("merchant not configured")).toMatch(/temporarily unavailable/i);
    expect(friendlyPaymentError("401 unauthorized")).toMatch(/temporarily unavailable/i);
  });

  it("falls back safely for junk and non-errors", () => {
    expect(friendlyPaymentError("")).toMatch(/try again/i);
    expect(friendlyPaymentError(undefined)).toMatch(/try again/i);
    expect(friendlyPaymentError(new Error(""))).toMatch(/try again/i);
    expect(friendlyPaymentError(42)).toMatch(/try again/i);
    expect(friendlyPaymentError({})).toMatch(/try again/i);
  });
});
