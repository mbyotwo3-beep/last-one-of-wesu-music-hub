/**
 * Tests for hero slide layout (resolveHeroLayout in HeroCarousel.tsx).
 *
 * Admin slides usually ship as wide promotional banners (e.g. 820×320 ≈
 * 2.56:1) with the title and artwork baked into the RIGHT side and an empty
 * dark gradient on the left. On desktop the hero box is 2.4:1 — a center
 * crop barely grazes the design. On mobile the 16:9 (1.78:1) box with a
 * CENTER crop would cut ~30% of the width, slicing the baked artwork and
 * title. Wide banners on mobile are therefore painted ANCHORED to their art
 * side ("right center"): the box is still filled edge to edge, the artwork
 * and title survive, and only the empty left strip is cropped — where the
 * overlay text sits, exactly like desktop.
 *
 * An unknown ratio must stay plain full-bleed so server-rendered and
 * first-client markup agree (the ratio only becomes known after hydration).
 *
 * Test framework : Vitest
 */

import { describe, it, expect } from "vitest";
import { resolveHeroLayout } from "../HeroCarousel";

describe("resolveHeroLayout", () => {
  it("desktop always keeps the plain centered cover", () => {
    expect(resolveHeroLayout({ ratio: 2.56, isMobile: false })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: 1, isMobile: false })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: null, isMobile: false })).toBe("full-bleed");
  });

  it("mobile wide admin banners anchor to their art side (the overflow fix)", () => {
    // 820×320 as used by the real admin slides.
    expect(resolveHeroLayout({ ratio: 2.56, isMobile: true })).toBe("art-anchored");
    expect(resolveHeroLayout({ ratio: 3, isMobile: true })).toBe("art-anchored");
  });

  it("mobile square/portrait artwork keeps the centered cover (the system-hero look)", () => {
    expect(resolveHeroLayout({ ratio: 1, isMobile: true })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: 4 / 5, isMobile: true })).toBe("full-bleed");
  });

  it("1.9 is the anchoring threshold", () => {
    expect(resolveHeroLayout({ ratio: 1.9, isMobile: true })).toBe("art-anchored");
    expect(resolveHeroLayout({ ratio: 1.89, isMobile: true })).toBe("full-bleed");
  });

  it("unknown ratio (not yet measured or probe failed) stays plain full-bleed", () => {
    expect(resolveHeroLayout({ ratio: null, isMobile: true })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: 0, isMobile: true })).toBe("full-bleed");
  });
});
