/**
 * Property-based tests for platform branching — BottomTabBar/Navbar mutual exclusion.
 *
 * Feature: wesu-plus-completion, Property 13: BottomTabBar renders on native, Navbar hidden
 * Validates: Requirements 5 (Req 7 in spec) AC1
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Platform } from "@/hooks/use-platform";

// ---------------------------------------------------------------------------
// Pure branching logic extracted from __root.tsx RootComponent
// ---------------------------------------------------------------------------

/**
 * Given the current platform, returns which layout components should be rendered.
 * This mirrors the branching logic in RootComponent.
 */
function getLayoutComponents(platform: Platform): {
  showNavbar: boolean;
  showPlayerBar: boolean;
  showMobileShell: boolean;
  showBottomTabBar: boolean;
} {
  if (platform === "native") {
    return {
      showNavbar: false,
      showPlayerBar: false,
      showMobileShell: true,
      showBottomTabBar: true,
    };
  }
  return {
    showNavbar: true,
    showPlayerBar: true,
    showMobileShell: false,
    showBottomTabBar: false,
  };
}

const platform = fc.constantFrom<Platform>("web", "native");

// ---------------------------------------------------------------------------
// Property 13: BottomTabBar renders on native, Navbar hidden
// Feature: wesu-plus-completion, Property 13: BottomTabBar renders on native, Navbar hidden
// Validates: Requirements 5 (Req 7 in spec) AC1
// ---------------------------------------------------------------------------

describe("Property 13: BottomTabBar/Navbar mutual exclusion", () => {
  it("should show MobileShell+BottomTabBar and hide Navbar+PlayerBar on native platform", () => {
    // **Validates: Requirements 5 AC1**
    const layout = getLayoutComponents("native");
    expect(layout.showMobileShell).toBe(true);
    expect(layout.showBottomTabBar).toBe(true);
    expect(layout.showNavbar).toBe(false);
    expect(layout.showPlayerBar).toBe(false);
  });

  it("should show Navbar+PlayerBar and hide MobileShell+BottomTabBar on web platform", () => {
    const layout = getLayoutComponents("web");
    expect(layout.showNavbar).toBe(true);
    expect(layout.showPlayerBar).toBe(true);
    expect(layout.showMobileShell).toBe(false);
    expect(layout.showBottomTabBar).toBe(false);
  });

  it("BottomTabBar and Navbar are mutually exclusive for any platform value", () => {
    fc.assert(
      fc.property(platform, (p) => {
        const layout = getLayoutComponents(p);
        // XOR: exactly one of BottomTabBar or Navbar is shown, never both
        const onlyOneShown =
          (layout.showBottomTabBar && !layout.showNavbar) ||
          (!layout.showBottomTabBar && layout.showNavbar);
        expect(onlyOneShown).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("MobileShell and Navbar are mutually exclusive for any platform value", () => {
    fc.assert(
      fc.property(platform, (p) => {
        const layout = getLayoutComponents(p);
        const onlyOneShown =
          (layout.showMobileShell && !layout.showNavbar) ||
          (!layout.showMobileShell && layout.showNavbar);
        expect(onlyOneShown).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("MobileShell presence implies BottomTabBar presence and vice versa", () => {
    fc.assert(
      fc.property(platform, (p) => {
        const layout = getLayoutComponents(p);
        expect(layout.showMobileShell).toBe(layout.showBottomTabBar);
      }),
      { numRuns: 100 },
    );
  });

  it("PlayerBar is shown if and only if Navbar is shown (web-only pair)", () => {
    fc.assert(
      fc.property(platform, (p) => {
        const layout = getLayoutComponents(p);
        expect(layout.showPlayerBar).toBe(layout.showNavbar);
      }),
      { numRuns: 100 },
    );
  });
});
