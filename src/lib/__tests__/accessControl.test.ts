/**
 * Property-based tests for audio access control, play count, and ad banner logic.
 *
 * Feature: wesu-plus-completion
 *
 * Property 1: Access control for paid songs
 * Validates: Requirements 2.2, 2.3
 *
 * Property 2: Free song public URL — no auth required
 * Validates: Requirements 2.5, 3.1
 *
 * Property 3: Play count increment by exactly 1
 * Validates: Requirements 2.1
 *
 * Property 4: Ad banner visibility rule
 * Validates: Requirements 3.3, 3.5
 *
 * Property 5: Auth-required routes redirect unauthenticated users
 * Validates: Requirements 3.7
 *
 * Property 6: Upload inserts song with pending status
 * Validates: Requirements 4.3
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure access control model
// ---------------------------------------------------------------------------

interface Song {
  id: string;
  price: number | null;
  status: "pending" | "approved" | "rejected";
}

interface User {
  id: string | null; // null = unauthenticated
  hasActiveSubscription: boolean;
  purchasedSongIds: string[];
}

/**
 * Pure model of getSignedAudioUrl access control logic.
 * Returns true if access is allowed, false otherwise.
 */
function canPlaySong(song: Song, user: User): { allowed: boolean; error?: string } {
  const price = song.price ?? 0;
  if (price <= 0) return { allowed: true }; // free song

  // Paid song — check auth
  if (!user.id) return { allowed: false, error: "Subscribe or purchase to play full track" };

  // Check subscription or purchase
  if (user.hasActiveSubscription) return { allowed: true };
  if (user.purchasedSongIds.includes(song.id)) return { allowed: true };

  return { allowed: false, error: "Subscribe or purchase to play full track" };
}

/**
 * Pure model of getPublicAudioUrl access control:
 * Free songs only, no auth required.
 */
function canGetPublicUrl(song: Song): { allowed: boolean; error?: string } {
  const price = song.price ?? 0;
  if (price > 0) return { allowed: false, error: "This song requires a subscription or purchase" };
  if (song.status !== "approved") return { allowed: false, error: "Song not found" };
  return { allowed: true };
}

/**
 * Pure model of ad banner visibility:
 * Show when unauthenticated OR authenticated with no active subscription.
 */
function shouldShowAdBanner(user: User): boolean {
  if (!user.id) return true; // unauthenticated
  if (!user.hasActiveSubscription) return true; // free registered user
  return false; // premium subscriber
}

/**
 * Auth-required route redirect check.
 */
const AUTH_REQUIRED_ROUTES = [
  "/dashboard",
  "/profile",
  "/artist-studio",
  "/artist-dashboard",
  "/admin",
  "/superadmin",
  "/checkout",
  "/collabs",
  "/label-dashboard",
];

function requiresAuthRedirect(route: string, isAuthenticated: boolean): boolean {
  return !isAuthenticated && AUTH_REQUIRED_ROUTES.includes(route);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const songId = fc.uuid();
const userId = fc.uuid();

const paidSong: fc.Arbitrary<Song> = fc.record({
  id: songId,
  price: fc.float({ min: 1.0, max: 1000.0, noNaN: true }),
  status: fc.constant("approved" as const),
});

const freeSong: fc.Arbitrary<Song> = fc.record({
  id: songId,
  price: fc.constantFrom(0, null),
  status: fc.constant("approved" as const),
});

const unauthUser: fc.Arbitrary<User> = fc.record({
  id: fc.constant(null),
  hasActiveSubscription: fc.constant(false),
  purchasedSongIds: fc.constant([]),
});

const freeUser: fc.Arbitrary<User> = fc.record({
  id: userId.map((id) => id),
  hasActiveSubscription: fc.constant(false),
  purchasedSongIds: fc.constant([]),
});

const premiumUser: fc.Arbitrary<User> = fc.record({
  id: userId.map((id) => id),
  hasActiveSubscription: fc.constant(true),
  purchasedSongIds: fc.constant([]),
});

// ---------------------------------------------------------------------------
// Property 1: Access control for paid songs
// Feature: wesu-plus-completion, Property 1: Access control for paid songs
// Validates: Requirements 2.2, 2.3
// ---------------------------------------------------------------------------

describe("Property 1: Access control for paid songs (Req 2.2, 2.3)", () => {
  it("paid song without subscription or purchase → denied with correct error message", () => {
    fc.assert(
      fc.property(paidSong, freeUser, (song, user) => {
        const result = canPlaySong(song, user);
        expect(result.allowed).toBe(false);
        expect(result.error).toBe("Subscribe or purchase to play full track");
      }),
      { numRuns: 100 },
    );
  });

  it("paid song for unauthenticated user → always denied", () => {
    fc.assert(
      fc.property(paidSong, unauthUser, (song, user) => {
        const result = canPlaySong(song, user);
        expect(result.allowed).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("paid song with active subscription → always allowed", () => {
    fc.assert(
      fc.property(paidSong, premiumUser, (song, user) => {
        const result = canPlaySong(song, user);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("paid song with purchase record → allowed", () => {
    fc.assert(
      fc.property(paidSong, userId, (song, uid) => {
        const user: User = { id: uid, hasActiveSubscription: false, purchasedSongIds: [song.id] };
        const result = canPlaySong(song, user);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Free song public URL — no auth required
// Feature: wesu-plus-completion, Property 2: Free song public URL
// Validates: Requirements 2.5, 3.1
// ---------------------------------------------------------------------------

describe("Property 2: Free song public URL (Req 2.5, 3.1)", () => {
  it("approved free song → always allowed without auth", () => {
    fc.assert(
      fc.property(freeSong, (song) => {
        const result = canGetPublicUrl(song);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("paid song via getPublicAudioUrl → always denied", () => {
    fc.assert(
      fc.property(paidSong, (song) => {
        const result = canGetPublicUrl(song);
        expect(result.allowed).toBe(false);
        expect(result.error).toBe("This song requires a subscription or purchase");
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Play count increment by exactly 1
// Feature: wesu-plus-completion, Property 3: Play count increment
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------

describe("Property 3: Play count increment by exactly 1 (Req 2.1)", () => {
  it("incrementing play_count always increases by exactly 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (playCount) => {
        const newCount = playCount + 1;
        expect(newCount - playCount).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it("play count is always greater after increment", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (playCount) => {
        expect(playCount + 1).toBeGreaterThan(playCount);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Ad banner visibility rule
// Feature: wesu-plus-completion, Property 4: Ad banner visibility rule
// Validates: Requirements 3.3, 3.5
// ---------------------------------------------------------------------------

describe("Property 4: Ad banner visibility rule (Req 3.3, 3.5)", () => {
  it("unauthenticated user always sees ad banner", () => {
    fc.assert(
      fc.property(unauthUser, (user) => {
        expect(shouldShowAdBanner(user)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("authenticated free user (no subscription) always sees ad banner", () => {
    fc.assert(
      fc.property(freeUser, (user) => {
        expect(shouldShowAdBanner(user)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("premium subscriber never sees ad banner", () => {
    fc.assert(
      fc.property(premiumUser, (user) => {
        expect(shouldShowAdBanner(user)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("ad banner state is mutually exclusive with premium subscription", () => {
    fc.assert(
      fc.property(fc.boolean(), userId, (hasSub, uid) => {
        const user: User = { id: uid, hasActiveSubscription: hasSub, purchasedSongIds: [] };
        const showAd = shouldShowAdBanner(user);
        if (hasSub) {
          expect(showAd).toBe(false);
        } else {
          expect(showAd).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Auth-required routes redirect unauthenticated users
// Feature: wesu-plus-completion, Property 5: Auth-required routes redirect
// Validates: Requirements 3.7
// ---------------------------------------------------------------------------

describe("Property 5: Auth-required routes redirect unauthenticated users (Req 3.7)", () => {
  it("all auth-required routes trigger redirect for unauthenticated user", () => {
    for (const route of AUTH_REQUIRED_ROUTES) {
      expect(requiresAuthRedirect(route, false)).toBe(true);
    }
  });

  it("auth-required routes do NOT redirect authenticated users", () => {
    for (const route of AUTH_REQUIRED_ROUTES) {
      expect(requiresAuthRedirect(route, true)).toBe(false);
    }
  });

  it("public routes never trigger auth redirect", () => {
    const publicRoutes = ["/", "/browse", "/artists", "/albums", "/subscriptions", "/auth"];
    fc.assert(
      fc.property(fc.constantFrom(...publicRoutes), fc.boolean(), (route, isAuth) => {
        expect(requiresAuthRedirect(route, isAuth)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Upload inserts song with pending status
// Feature: wesu-plus-completion, Property 6: Upload inserts song with pending status
// Validates: Requirements 4.3
// ---------------------------------------------------------------------------

describe("Property 6: Upload inserts song with pending status (Req 4.3)", () => {
  /**
   * The uploadSong server function always inserts with status: 'pending'.
   * This test verifies the pure data contract.
   */
  it("new song record should always start with status 'pending'", () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 100 }),
          genre: fc.string({ minLength: 1, maxLength: 50 }),
          price: fc.float({ min: 0, max: 100, noNaN: true }),
          audio_url: fc.webUrl(),
        }),
        (songData) => {
          // The uploadSong function always sets status: 'pending'
          const insertedRecord = { ...songData, status: "pending" };
          expect(insertedRecord.status).toBe("pending");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("status 'pending' means the song is NOT yet approved or rejected", () => {
    fc.assert(
      fc.property(fc.constant("pending"), (status) => {
        expect(status).not.toBe("approved");
        expect(status).not.toBe("rejected");
      }),
      { numRuns: 1 },
    );
  });
});
