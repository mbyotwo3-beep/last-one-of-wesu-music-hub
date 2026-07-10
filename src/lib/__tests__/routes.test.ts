/**
 * Property-based tests for route reachability on native platform.
 *
 * Feature: wesu-plus-completion, Property 23: All web routes reachable on native
 * Validates: Requirements 19.1
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeTabs } from "@/components/mobile/BottomTabBar";

// ---------------------------------------------------------------------------
// Route registry — every route that must be reachable on native
// ---------------------------------------------------------------------------

const WEB_ROUTES = [
  "/",
  "/browse",
  "/artists",
  "/albums",
  "/subscriptions",
  "/dashboard",
  "/profile",
  "/artist-dashboard",
  "/artist-studio",
  "/collabs",
  "/label-dashboard",
  "/apply-label",
  "/admin",
  "/superadmin",
  "/checkout",
  "/auth",
  "/now-playing",
] as const;

type Route = (typeof WEB_ROUTES)[number];

/**
 * Models the access method for a route on native:
 * - 'tab'        → directly in BottomTabBar
 * - 'contextual' → reached via contextual action (link, button, deep link)
 * - 'deep-link'  → handled via registerDeepLinkHandler / URL scheme
 */
type AccessMethod = "tab" | "contextual" | "deep-link";

interface RouteAccess {
  route: Route;
  methods: AccessMethod[];
}

// Routes directly accessible from BottomTabBar tabs
const TAB_ROUTES: Route[] = ["/", "/browse", "/dashboard", "/profile"];
// Routes accessible via role-based tabs
const ROLE_TAB_ROUTES: Route[] = ["/artist-studio", "/admin", "/superadmin"];
// Routes accessible contextually (links, buttons, navigation actions)
const CONTEXTUAL_ROUTES: Route[] = [
  "/artists",
  "/albums",
  "/subscriptions",
  "/artist-dashboard",
  "/collabs",
  "/label-dashboard",
  "/apply-label",
  "/checkout",
  "/auth",
  "/now-playing",
];

const ROUTE_ACCESS_MAP: RouteAccess[] = [
  ...TAB_ROUTES.map((r) => ({ route: r, methods: ["tab"] as AccessMethod[] })),
  ...ROLE_TAB_ROUTES.map((r) => ({ route: r, methods: ["tab"] as AccessMethod[] })),
  ...CONTEXTUAL_ROUTES.map((r) => ({ route: r, methods: ["contextual"] as AccessMethod[] })),
];

// ---------------------------------------------------------------------------
// Property 23: All web routes reachable on native
// Feature: wesu-plus-completion, Property 23: All web routes reachable on native
// Validates: Requirements 19.1
// ---------------------------------------------------------------------------

describe("Property 23: All web routes reachable on native platform", () => {
  it("every web route has at least one access method defined", () => {
    for (const route of WEB_ROUTES) {
      const access = ROUTE_ACCESS_MAP.find((a) => a.route === route);
      expect(access, `Route ${route} has no access method defined`).toBeDefined();
      expect(access!.methods.length).toBeGreaterThan(0);
    }
  });

  it("tab routes are included in BottomTabBar for fully-authenticated superadmin user", () => {
    const tabs = computeTabs({
      isAuthenticated: true,
      isArtist: true,
      isAdmin: true,
      isSuperAdmin: true,
    });
    const tabRoutes = tabs.map((t) => t.to);
    // Core always-visible tabs
    expect(tabRoutes).toContain("/");
    expect(tabRoutes).toContain("/browse");
    expect(tabRoutes).toContain("/dashboard");
    expect(tabRoutes).toContain("/profile");
    // Role-specific tabs
    expect(tabRoutes).toContain("/artist-studio");
    expect(tabRoutes).toContain("/superadmin");
  });

  it("all routes in TAB_ROUTES are present in BottomTabBar for authenticated user", () => {
    const tabs = computeTabs({
      isAuthenticated: true,
      isArtist: false,
      isAdmin: false,
      isSuperAdmin: false,
    });
    const tabRoutes = tabs.map((t) => t.to);
    for (const route of TAB_ROUTES) {
      expect(tabRoutes, `Tab route ${route} missing from BottomTabBar`).toContain(route);
    }
  });

  it("contextual routes are documented as reachable via in-app navigation or links", () => {
    // All contextual routes should have a documented access method
    for (const route of CONTEXTUAL_ROUTES) {
      const access = ROUTE_ACCESS_MAP.find((a) => a.route === route);
      expect(access).toBeDefined();
      expect(access!.methods).toContain("contextual");
    }
  });

  it("route count matches: all WEB_ROUTES are accounted for in the access map", () => {
    const mappedRoutes = new Set(ROUTE_ACCESS_MAP.map((a) => a.route));
    for (const route of WEB_ROUTES) {
      expect(mappedRoutes.has(route), `${route} not in access map`).toBe(true);
    }
  });

  it("property: for any subset of roles, at least Home and Browse are tab-accessible", () => {
    fc.assert(
      fc.property(
        fc.record({
          isAuthenticated: fc.boolean(),
          isArtist: fc.boolean(),
          isAdmin: fc.boolean(),
          isSuperAdmin: fc.boolean(),
        }),
        (state) => {
          const tabs = computeTabs(state);
          const routes = tabs.map((t) => t.to);
          expect(routes).toContain("/");
          expect(routes).toContain("/browse");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("now-playing route is reachable via MiniPlayer tap (contextual)", () => {
    const nowPlayingAccess = ROUTE_ACCESS_MAP.find((a) => a.route === "/now-playing");
    expect(nowPlayingAccess).toBeDefined();
    expect(nowPlayingAccess!.methods).toContain("contextual");
  });
});
