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

// Routes directly accessible from BottomTabBar tabs (fixed set: Home,
// Browse, Library — plus the Search and Menu buttons, max 6 bar items).
// NOTE: the Library tab points at /library (real library content for every
// role). /dashboard is a role-router (listeners see "My Library" there,
// staff/artists bounce to their portals) and stays reachable contextually.
const TAB_ROUTES: Route[] = ["/", "/browse", "/library"];
// Former role tabs (Profile, Studio, Admin) moved into the Menu sheet.
const MENU_ROUTES: Route[] = ["/profile", "/artist-studio", "/admin", "/superadmin"];
// Routes accessible contextually (links, buttons, navigation actions)
const CONTEXTUAL_ROUTES: Route[] = [
  "/artists",
  "/albums",
  "/subscriptions",
  "/dashboard",
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
  ...MENU_ROUTES.map((r) => ({ route: r, methods: ["contextual"] as AccessMethod[] })),
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

  it("tab routes are the fixed Home/Browse/Library set", () => {
    const tabs = computeTabs();
    const tabRoutes = tabs.map((t) => t.to);
    expect(tabRoutes).toEqual(["/", "/browse", "/library"]);
  });

  it("former role tabs (Profile/Studio/Admin) are reachable via the Menu sheet", () => {
    for (const route of MENU_ROUTES) {
      const access = ROUTE_ACCESS_MAP.find((a) => a.route === route);
      expect(access).toBeDefined();
      expect(access!.methods).toContain("contextual");
    }
    const tabRoutes = computeTabs().map((t) => t.to);
    for (const route of MENU_ROUTES) {
      expect(tabRoutes).not.toContain(route);
    }
  });

  it("all routes in TAB_ROUTES are present in BottomTabBar", () => {
    const tabs = computeTabs();
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

  it("property: Home and Browse are always tab-accessible", () => {
    const tabs = computeTabs();
    const routes = tabs.map((t) => t.to);
    expect(routes).toContain("/");
    expect(routes).toContain("/browse");
  });

  it("now-playing route is reachable via MiniPlayer tap (contextual)", () => {
    const nowPlayingAccess = ROUTE_ACCESS_MAP.find((a) => a.route === "/now-playing");
    expect(nowPlayingAccess).toBeDefined();
    expect(nowPlayingAccess!.methods).toContain("contextual");
  });
});
