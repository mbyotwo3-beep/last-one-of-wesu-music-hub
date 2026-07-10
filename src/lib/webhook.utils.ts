/**
 * Pure utility functions for DPO Pay webhook handling.
 * Extracted from the TanStack Start route handler so they can be unit-tested
 * without importing framework-specific code.
 *
 * Feature: wesu-plus-completion
 */

/**
 * Verify that the CompanyToken in a webhook request body matches the expected
 * environment token.
 *
 * Production behaviour (when envToken is non-empty):
 *   - Returns `true` if bodyToken === envToken.
 *   - Returns `false` if there is a mismatch → handler should respond 401.
 *
 * Simulation mode (when envToken is empty string):
 *   - Always returns `true` to allow local testing without DPO credentials.
 *
 * @param bodyToken  CompanyToken extracted from the POST body.
 * @param envToken   Value of process.env.DPO_COMPANY_TOKEN (may be empty).
 */
export function verifyCompanyToken(bodyToken: string, envToken: string): boolean {
  // Simulation mode — bypass verification when no env token is configured.
  if (!envToken) return true;
  return bodyToken === envToken;
}

/**
 * Map a DPO CCDapproval code to a payment transaction status string.
 *
 * DPO approval codes:
 *   '000' → payment approved   → 'completed'
 *   '904' → payment cancelled  → 'cancelled'
 *   anything else              → 'failed'
 *
 * @param ccdApproval  Raw CCDapproval string from DPO Pay payload.
 */
export function determineTxStatus(ccdApproval: string): "completed" | "failed" | "cancelled" {
  if (ccdApproval === "000") return "completed";
  if (ccdApproval === "904") return "cancelled";
  return "failed";
}

/**
 * Return `true` when the CCDapproval code signals a successful payment
 * that should trigger fulfillment.
 *
 * @param ccdApproval  Raw CCDapproval string from DPO Pay payload.
 */
export function shouldFulfill(ccdApproval: string): boolean {
  return ccdApproval === "000";
}
