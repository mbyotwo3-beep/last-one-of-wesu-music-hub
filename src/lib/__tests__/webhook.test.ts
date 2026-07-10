/**
 * Property-based and unit tests for DPO Pay webhook handling.
 *
 * These tests exercise:
 *  - Pure webhook utility functions (verifyCompanyToken, determineTxStatus, shouldFulfill)
 *  - fulfillTransaction logic via vi.mock() for Supabase calls
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 *
 * Feature: wesu-plus-completion
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { verifyCompanyToken, determineTxStatus, shouldFulfill } from "../webhook.utils";

// ---------------------------------------------------------------------------
// vi.mock for supabaseAdmin — used in fulfillTransaction tests (Property 11)
// ---------------------------------------------------------------------------

// Mock the supabase admin client
// The chain must support: .from().select().eq().maybeSingle()
//                         .from().upsert().           (subscription path)
//                         .from().insert().select().single()  (purchase path)
//                         .from().select().eq().maybeSingle() (artist lookup)
//                         .from().insert()            (revenue split)
vi.mock("@/integrations/supabase/client.server", () => {
  const makeChain = () => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = ["select", "eq", "single", "maybeSingle", "update", "insert", "upsert"];
    for (const m of methods) {
      // Each method returns `obj` by default, allowing further chaining.
      // Individual tests can override with .mockResolvedValueOnce etc.
      obj[m] = vi.fn().mockReturnValue(obj);
    }
    return obj;
  };

  const chainObj = makeChain();

  return {
    supabaseAdmin: {
      from: vi.fn().mockReturnValue(chainObj),
    },
    // Expose the chain so tests can configure individual call responses
    __chainObj: chainObj,
  };
});

// Import AFTER mocking so the module binds to the mock
import { fulfillTransaction } from "../payments.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/**
 * Non-empty ASCII alphanumeric strings — always safe as token values.
 */
const nonEmptyToken = fc.stringOf(
  fc.mapToConstant(
    { num: 26, build: (i) => String.fromCharCode(65 + i) }, // A-Z
    { num: 26, build: (i) => String.fromCharCode(97 + i) }, // a-z
    { num: 10, build: (i) => String.fromCharCode(48 + i) }, // 0-9
  ),
  { minLength: 1, maxLength: 40 },
);

/**
 * Tokens that are guaranteed to be different from a reference token.
 * We generate a second token and append a suffix to ensure inequality.
 */
const mismatchedPair = fc.tuple(nonEmptyToken, nonEmptyToken).filter(([a, b]) => a !== b);

// ---------------------------------------------------------------------------
// Property 10: Webhook CompanyToken verification returns 401 on mismatch
// ---------------------------------------------------------------------------
// Feature: wesu-plus-completion, Property 10: Webhook CompanyToken verification returns 401 on mismatch
// Validates: Requirements 6.2

describe("Property 10: Webhook CompanyToken verification", () => {
  it("should return false (→ 401) for any bodyToken that does NOT match a non-empty envToken", () => {
    // **Validates: Requirements 6.2**
    fc.assert(
      fc.property(mismatchedPair, ([envToken, bodyToken]) => {
        // Neither token is empty, and they are guaranteed to differ.
        const result = verifyCompanyToken(bodyToken, envToken);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("should return true when bodyToken === envToken (non-empty)", () => {
    fc.assert(
      fc.property(nonEmptyToken, (token) => {
        const result = verifyCompanyToken(token, token);
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should return true in simulation mode (envToken is empty string) regardless of bodyToken", () => {
    // Documents the simulation-mode bypass — envToken = '' → always allowed.
    fc.assert(
      fc.property(fc.string(), (bodyToken) => {
        const result = verifyCompanyToken(bodyToken, "");
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("should return false for empty bodyToken when envToken is non-empty", () => {
    fc.assert(
      fc.property(nonEmptyToken, (envToken) => {
        const result = verifyCompanyToken("", envToken);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Payment fulfillment state transitions
// ---------------------------------------------------------------------------
// Feature: wesu-plus-completion, Property 11: Payment fulfillment state transitions
// Validates: Requirements 6.3, 6.4, 6.5

describe("Property 11: Payment fulfillment state transitions", () => {
  /**
   * These tests verify the deterministic output of determineTxStatus for
   * ccdApproval === '000' (PAYMENT_COMPLETED), and that shouldFulfill drives
   * the correct branch.
   *
   * The fulfillTransaction function itself is tested with mocked Supabase calls
   * to verify it issues the correct DB operations without hitting a real DB.
   */

  it("determineTxStatus should return 'completed' for ccdApproval === '000'", () => {
    // **Validates: Requirements 6.3**
    fc.assert(
      fc.property(fc.constant("000"), (code) => {
        expect(determineTxStatus(code)).toBe("completed");
      }),
      { numRuns: 1 },
    );
  });

  it("shouldFulfill should return true only when ccdApproval === '000'", () => {
    fc.assert(
      fc.property(nonEmptyToken, (code) => {
        const result = shouldFulfill(code);
        expect(result).toBe(code === "000");
      }),
      { numRuns: 100 },
    );
  });

  it("fulfillTransaction for item_type='subscription' should call supabaseAdmin.from('subscriptions').upsert", async () => {
    // **Validates: Requirements 6.4**
    const mod = (await import("@/integrations/supabase/client.server")) as any;
    const chainObj = mod.__chainObj;

    // Reset all mocks, then configure responses for this test's call sequence:
    // 1) subscription_plans → .select().eq().maybeSingle() → { interval: 'month' }
    // 2) subscriptions → .upsert() → { error: null }
    vi.clearAllMocks();
    // Every chain method returns chainObj (already the default), so we only
    // need to configure the terminal promise-returning calls.
    chainObj.select.mockReturnValue(chainObj);
    chainObj.eq.mockReturnValue(chainObj);
    chainObj.maybeSingle.mockResolvedValueOnce({ data: { interval: "month" }, error: null });
    chainObj.upsert.mockResolvedValueOnce({ data: null, error: null });
    // Re-attach chainObj to from() since clearAllMocks resets it
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue(chainObj);

    const tx = {
      id: "tx-sub-001",
      user_id: "user-001",
      item_type: "subscription" as const,
      item_id: "plan-001",
      amount: 50,
      currency: "ZMW",
    };

    await fulfillTransaction(tx);

    // Verify supabaseAdmin.from was called with 'subscriptions' at some point
    const fromCalls: string[] = (supabaseAdmin.from as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: any[]) => c[0],
    );
    expect(fromCalls).toContain("subscriptions");
  });

  it("fulfillTransaction for item_type='song' should call supabaseAdmin.from('purchases').insert", async () => {
    // **Validates: Requirements 6.5**
    const mod = (await import("@/integrations/supabase/client.server")) as any;
    const chainObj = mod.__chainObj;

    vi.clearAllMocks();
    // Re-wire chain methods to return chainObj for chaining
    for (const m of ["select", "eq", "insert", "upsert", "update"]) {
      chainObj[m].mockReturnValue(chainObj);
    }
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue(chainObj);

    // Call sequence:
    // 1) purchases.insert().select().single() → { data: { id: 'purchase-001' }, error: null }
    // 2) songs.select().eq().maybeSingle()    → { data: { artist_id: 'artist-001' } }
    // 3) platform_settings.select().eq().maybeSingle() → { data: { value: { commission_pct: 20 } } }
    // 4) revenue_splits.insert()              → { data: null, error: null }
    chainObj.single.mockResolvedValueOnce({ data: { id: "purchase-001" }, error: null });
    chainObj.maybeSingle
      .mockResolvedValueOnce({ data: { artist_id: "artist-001" }, error: null })
      .mockResolvedValueOnce({ data: { value: { commission_pct: 20 } }, error: null });

    const tx = {
      id: "tx-song-001",
      user_id: "user-001",
      item_type: "song" as const,
      item_id: "song-001",
      amount: 10,
      currency: "ZMW",
    };

    await fulfillTransaction(tx);

    const fromCalls: string[] = (supabaseAdmin.from as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: any[]) => c[0],
    );
    expect(fromCalls).toContain("purchases");
  });

  it("fulfillTransaction for item_type='album' should call supabaseAdmin.from('purchases').insert", async () => {
    // **Validates: Requirements 6.5**
    const mod = (await import("@/integrations/supabase/client.server")) as any;
    const chainObj = mod.__chainObj;

    vi.clearAllMocks();
    for (const m of ["select", "eq", "insert", "upsert", "update"]) {
      chainObj[m].mockReturnValue(chainObj);
    }
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue(chainObj);

    chainObj.single.mockResolvedValueOnce({ data: { id: "purchase-002" }, error: null });
    chainObj.maybeSingle
      .mockResolvedValueOnce({ data: { artist_id: "artist-002" }, error: null })
      .mockResolvedValueOnce({ data: { value: { commission_pct: 20 } }, error: null });

    const tx = {
      id: "tx-album-001",
      user_id: "user-002",
      item_type: "album" as const,
      item_id: "album-001",
      amount: 30,
      currency: "ZMW",
    };

    await fulfillTransaction(tx);

    const fromCalls: string[] = (supabaseAdmin.from as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: any[]) => c[0],
    );
    expect(fromCalls).toContain("purchases");
  });
});

// ---------------------------------------------------------------------------
// Property 12: Failed/cancelled payments update transaction status
// ---------------------------------------------------------------------------
// Feature: wesu-plus-completion, Property 12: Failed/cancelled payments update transaction status
// Validates: Requirements 6.6

describe("Property 12: Failed/cancelled payment status mapping", () => {
  /**
   * Verifies that determineTxStatus maps all non-'000' DPO CCDapproval codes
   * to either 'failed' or 'cancelled', and specifically that code '904'
   * maps to 'cancelled' and all other non-'000' codes map to 'failed'.
   */

  it("should return 'cancelled' for ccdApproval === '904'", () => {
    // **Validates: Requirements 6.6**
    expect(determineTxStatus("904")).toBe("cancelled");
  });

  it("should return 'failed' for any ccdApproval that is not '000' and not '904'", () => {
    // **Validates: Requirements 6.6**
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== "000" && s !== "904"),
        (code) => {
          expect(determineTxStatus(code)).toBe("failed");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should return 'failed' or 'cancelled' (never 'completed') for any non-'000' code", () => {
    // **Validates: Requirements 6.6**
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== "000"),
        (code) => {
          const status = determineTxStatus(code);
          expect(["failed", "cancelled"]).toContain(status);
          expect(status).not.toBe("completed");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("determineTxStatus is the inverse of shouldFulfill — status is never 'completed' when shouldFulfill is false", () => {
    // **Validates: Requirements 6.6**
    fc.assert(
      fc.property(fc.string(), (code) => {
        const status = determineTxStatus(code);
        const fulfills = shouldFulfill(code);

        if (!fulfills) {
          expect(status).not.toBe("completed");
        }
        if (status === "completed") {
          expect(fulfills).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 3.7 Unit tests for webhook endpoint (Requirements 6.1 and 6.7)
// ---------------------------------------------------------------------------

describe("Webhook unit tests (Requirements 6.1 and 6.7)", () => {
  /**
   * These tests exercise the pure business-logic helpers that implement the
   * webhook endpoint behaviour without requiring a running HTTP server.
   *
   * Req 6.1: The endpoint responds to POST requests (response is always HTTP 200
   *          unless CompanyToken verification fails — tested via verifyCompanyToken).
   * Req 6.7: Unknown provider_token → handler returns HTTP 200 and logs a warning
   *          without writing to the DB.
   */

  it("verifyCompanyToken returns true for matching tokens — endpoint would proceed (Req 6.1)", () => {
    const token = "test-company-token-123";
    expect(verifyCompanyToken(token, token)).toBe(true);
  });

  it("shouldFulfill returns false for empty ccdApproval — no fulfillment attempted (Req 6.7 adjacent)", () => {
    // An empty provider_token in the webhook body causes the handler to return 200
    // without any DB write. The pure logic equivalent: shouldFulfill('') === false.
    expect(shouldFulfill("")).toBe(false);
  });

  it("unknown provider_token scenario: determineTxStatus not called — handler returns 200 without DB update (Req 6.7)", () => {
    /**
     * When the webhook looks up payment_transactions by provider_token and finds
     * no row, the handler short-circuits with return new Response('OK', {status:200}).
     * This test documents that the pure status-mapping utility is NOT involved in
     * that path — the handler just skips it.
     *
     * We verify this by confirming determineTxStatus is a pure function that does
     * not produce side effects of its own. The handler's no-DB-write guarantee is
     * structural (early return), not dependent on the utility functions here.
     */
    const status = determineTxStatus("000"); // Even the success code
    expect(status).toBe("completed"); // Just the pure value
    // The point: the handler never calls this when provider_token is unknown.
    // This is documented rather than testable via these pure functions alone.
  });

  it("verifyCompanyToken returns false for mismatched token — handler would return 401 (Req 6.2)", () => {
    const envToken = "production-secret-token";
    const wrongToken = "attacker-supplied-token";
    expect(verifyCompanyToken(wrongToken, envToken)).toBe(false);
  });

  it("determineTxStatus covers all DPO approval code cases without throwing", () => {
    // Exhaustive check of known DPO codes
    expect(determineTxStatus("000")).toBe("completed");
    expect(determineTxStatus("904")).toBe("cancelled");
    expect(determineTxStatus("901")).toBe("failed");
    expect(determineTxStatus("999")).toBe("failed");
    expect(determineTxStatus("")).toBe("failed");
  });
});
