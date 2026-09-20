/**
 * Tests for BottomTabBar tab derivation.
 *
 * The mobile bar (shared by mobile browsers and the native app) shows a
 * FIXED set of at most MAX_BAR_ITEMS buttons: Home, Browse, Library,
 * Search, Menu. Everything else lives in the Menu sheet.
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import { computeTabs, MAX_BAR_ITEMS } from "../mobile/BottomTabBar";

describe("BottomTabBar fixed tab set", () => {
  it("always returns exactly Home, Browse, Library — no role arguments", () => {
    const tabs = computeTabs();
    expect(tabs.map((t) => t.to)).toEqual(["/", "/browse", "/library"]);
  });

  it("bar total (tabs + Search + Menu) never exceeds MAX_BAR_ITEMS", () => {
    const tabs = computeTabs();
    // Search and Menu buttons are rendered alongside the tabs.
    expect(tabs.length + 2).toBeLessThanOrEqual(MAX_BAR_ITEMS);
    expect(MAX_BAR_ITEMS).toBe(6);
  });

  it("Library requires auth (redirects to /auth when tapped signed-out)", () => {
    const tabs = computeTabs();
    expect(tabs.find((t) => t.to === "/library")?.requireAuth).toBe(true);
  });

  it("has no duplicate routes and every tab has a non-empty ariaLabel", () => {
    const tabs = computeTabs();
    const routes = tabs.map((t) => t.to);
    expect(new Set(routes).size).toBe(routes.length);
    for (const tab of tabs) {
      expect(tab.ariaLabel).toBeTruthy();
    }
  });

  it("keeps role-specific destinations out of the bar (they live in Menu)", () => {
    const routes = computeTabs().map((t) => t.to);
    expect(routes).not.toContain("/profile");
    expect(routes).not.toContain("/artist-studio");
    expect(routes).not.toContain("/admin");
    expect(routes).not.toContain("/superadmin");
  });
});
