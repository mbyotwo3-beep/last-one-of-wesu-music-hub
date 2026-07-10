/**
 * Property-based tests for RoleGate access control logic.
 *
 * Feature: wesu-plus-completion, Property 24: RoleGate violation redirects with toast
 * Validates: Requirements 19.2
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { checkRoleAccess, type AppRole } from "../roleGate.utils";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const appRole = fc.constantFrom<AppRole>("user", "artist", "admin", "superadmin");

const roleState = fc.record({
  isUser: fc.boolean(),
  isArtist: fc.boolean(),
  isAdmin: fc.boolean(),
  isSuperAdmin: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Property 24: RoleGate violation redirects with toast
// Feature: wesu-plus-completion, Property 24: RoleGate violation redirects with toast
// Validates: Requirements 19.2
// ---------------------------------------------------------------------------

describe("Property 24: RoleGate redirect on role violation", () => {
  it("should return 'redirect-auth' for any unauthenticated user regardless of required role", () => {
    fc.assert(
      fc.property(
        appRole,
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (require, isArtist, isAdmin, isSuperAdmin) => {
          const result = checkRoleAccess({
            require,
            isUser: false,
            isArtist,
            isAdmin,
            isSuperAdmin,
          });
          expect(result).toBe("redirect-auth");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should return 'redirect-home' (not 'allowed') when authenticated user lacks required role", () => {
    // Test: authenticated user with only the 'user' role trying to access artist/admin/superadmin routes
    fc.assert(
      fc.property(fc.constantFrom<AppRole>("artist", "admin", "superadmin"), (require) => {
        const result = checkRoleAccess({
          require,
          isUser: true,
          isArtist: false,
          isAdmin: false,
          isSuperAdmin: false,
        });
        expect(result).toBe("redirect-home");
      }),
      { numRuns: 100 },
    );
  });

  it("should return 'redirect-home' when artist tries to access admin route", () => {
    fc.assert(
      fc.property(fc.constantFrom<AppRole>("admin", "superadmin"), (require) => {
        const result = checkRoleAccess({
          require,
          isUser: true,
          isArtist: true,
          isAdmin: false,
          isSuperAdmin: false,
        });
        expect(result).toBe("redirect-home");
      }),
      { numRuns: 100 },
    );
  });

  it("should return 'redirect-home' when admin tries to access superadmin-only route", () => {
    const result = checkRoleAccess({
      require: "superadmin",
      isUser: true,
      isArtist: false,
      isAdmin: true,
      isSuperAdmin: false,
    });
    expect(result).toBe("redirect-home");
  });

  it("should never return 'allowed' for any unauthenticated user", () => {
    fc.assert(
      fc.property(appRole, roleState, (require, state) => {
        const result = checkRoleAccess({
          ...state,
          isUser: false,
          require,
        });
        expect(result).not.toBe("allowed");
      }),
      { numRuns: 100 },
    );
  });

  it("should return 'allowed' for authenticated user with 'user' require when isUser is true", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (isArtist, isAdmin, isSuperAdmin) => {
        const result = checkRoleAccess({
          require: "user",
          isUser: true,
          isArtist,
          isAdmin,
          isSuperAdmin,
        });
        expect(result).toBe("allowed");
      }),
      { numRuns: 100 },
    );
  });

  it("should return 'allowed' for artist role when isArtist is true", () => {
    const result = checkRoleAccess({
      require: "artist",
      isUser: true,
      isArtist: true,
      isAdmin: false,
      isSuperAdmin: false,
    });
    expect(result).toBe("allowed");
  });

  it("should return 'allowed' for artist role when isAdmin is true (admin supersedes artist)", () => {
    fc.assert(
      fc.property(fc.boolean(), (isSuperAdmin) => {
        const result = checkRoleAccess({
          require: "artist",
          isUser: true,
          isArtist: false,
          isAdmin: true,
          isSuperAdmin,
        });
        expect(result).toBe("allowed");
      }),
      { numRuns: 100 },
    );
  });

  it("should return 'allowed' for admin role when isSuperAdmin is true (superadmin supersedes admin)", () => {
    const result = checkRoleAccess({
      require: "admin",
      isUser: true,
      isArtist: false,
      isAdmin: false,
      isSuperAdmin: true,
    });
    expect(result).toBe("allowed");
  });

  it("should return 'allowed' for superadmin role only when isSuperAdmin is true", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isArtist, isAdmin) => {
        // Without isSuperAdmin, should redirect-home
        const denied = checkRoleAccess({
          require: "superadmin",
          isUser: true,
          isArtist,
          isAdmin,
          isSuperAdmin: false,
        });
        expect(denied).toBe("redirect-home");

        // With isSuperAdmin, should be allowed
        const allowed = checkRoleAccess({
          require: "superadmin",
          isUser: true,
          isArtist,
          isAdmin,
          isSuperAdmin: true,
        });
        expect(allowed).toBe("allowed");
      }),
      { numRuns: 100 },
    );
  });

  it("result is always one of the three valid states for any input combination", () => {
    fc.assert(
      fc.property(appRole, roleState, (require, state) => {
        const result = checkRoleAccess({ ...state, require });
        expect(["allowed", "redirect-auth", "redirect-home"]).toContain(result);
      }),
      { numRuns: 100 },
    );
  });
});
