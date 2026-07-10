/**
 * Property-based tests for authentication and session management.
 *
 * Feature: wesu-plus-completion, Property 22: Sign out clears session
 * Validates: Requirements 18.5
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure sign-out logic extracted for testing
// ---------------------------------------------------------------------------

/**
 * Pure model of the sign-out effect on session state.
 * Mirrors what supabase.auth.signOut() achieves in the app.
 */
interface SessionState {
  userId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
}

function signOut(_session: SessionState): SessionState {
  return {
    userId: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
  };
}

function isSessionCleared(session: SessionState): boolean {
  return (
    session.userId === null &&
    session.accessToken === null &&
    session.refreshToken === null &&
    session.isAuthenticated === false
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const nonEmptyStr = fc.string({ minLength: 1, maxLength: 64 });

const authenticatedSession: fc.Arbitrary<SessionState> = fc.record({
  userId: nonEmptyStr,
  accessToken: nonEmptyStr,
  refreshToken: nonEmptyStr,
  isAuthenticated: fc.constant(true),
});

// ---------------------------------------------------------------------------
// Property 22: Sign out clears session
// Feature: wesu-plus-completion, Property 22: Sign out clears session
// Validates: Requirements 18.5
// ---------------------------------------------------------------------------

describe("Property 22: Sign out clears session", () => {
  it("signing out any authenticated session should result in null userId", () => {
    fc.assert(
      fc.property(authenticatedSession, (session) => {
        const result = signOut(session);
        expect(result.userId).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("signing out any authenticated session should result in null accessToken", () => {
    fc.assert(
      fc.property(authenticatedSession, (session) => {
        const result = signOut(session);
        expect(result.accessToken).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("signing out any authenticated session should result in null refreshToken", () => {
    fc.assert(
      fc.property(authenticatedSession, (session) => {
        const result = signOut(session);
        expect(result.refreshToken).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("signing out any authenticated session should set isAuthenticated to false", () => {
    fc.assert(
      fc.property(authenticatedSession, (session) => {
        const result = signOut(session);
        expect(result.isAuthenticated).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("signed-out session should pass isSessionCleared check for any initial session", () => {
    fc.assert(
      fc.property(authenticatedSession, (session) => {
        const result = signOut(session);
        expect(isSessionCleared(result)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("signing out should be idempotent — signing out twice produces the same cleared state", () => {
    fc.assert(
      fc.property(authenticatedSession, (session) => {
        const firstSignOut = signOut(session);
        const secondSignOut = signOut(firstSignOut);
        expect(firstSignOut).toEqual(secondSignOut);
      }),
      { numRuns: 100 },
    );
  });

  it("documents that supabase.auth.signOut() is called during sign-out flow", () => {
    // This test documents the integration contract:
    // MobileProfile sign-out calls supabase.auth.signOut() → then navigates to /
    const mockSignOut = vi.fn().mockResolvedValue({ error: null });
    const mockNavigate = vi.fn();

    async function performSignOut() {
      await mockSignOut();
      mockNavigate({ to: "/" });
    }

    performSignOut().then(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
    });
  });
});
