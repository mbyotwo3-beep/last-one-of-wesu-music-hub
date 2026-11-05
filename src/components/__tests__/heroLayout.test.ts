/**
 * Tests for hero slide layout (resolveHeroLayout in HeroCarousel.tsx).
 *
 * Admin slides often ship as wide promotional banners (e.g. 820×320 ≈ 2.56:1)
 * with the title and artwork baked into the image. On desktop the hero box is
 * 2.4:1 so those banners fit almost exactly; on mobile the 16:9 (1.78:1) box
 * center-crops ~30% of the banner's width — artwork cut mid-subject and the
 * baked-in title colliding with the overlay text. Wide banners (and video
 * slides, whose iframe has no natural shape to preserve) therefore render
 * STACKED on mobile: full uncropped media on top, text below. Square artwork
 * (the system-generated hero's album art) and desktop keep the full-bleed
 * overlay look.
 *
 * An unknown ratio must stay full-bleed so server-rendered and first-client
 * markup agree (the ratio only becomes known after hydration).
 *
 * Test framework : Vitest
 */

import { describe, it, expect } from "vitest";
import { resolveHeroLayout } from "../HeroCarousel";

describe("resolveHeroLayout", () => {
  it("desktop always keeps the full-bleed overlay", () => {
    expect(resolveHeroLayout({ ratio: 2.56, isMobile: false, hasVideo: false })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: 1, isMobile: false, hasVideo: false })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: null, isMobile: false, hasVideo: true })).toBe("full-bleed");
  });

  it("mobile wide admin banners render stacked (the overflow fix)", () => {
    // 820×320 as used by the real admin slides.
    expect(resolveHeroLayout({ ratio: 2.56, isMobile: true, hasVideo: false })).toBe("stacked");
    expect(resolveHeroLayout({ ratio: 3, isMobile: true, hasVideo: false })).toBe("stacked");
  });

  it("mobile square/portrait artwork keeps full-bleed (the system-hero look)", () => {
    expect(resolveHeroLayout({ ratio: 1, isMobile: true, hasVideo: false })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: 4 / 5, isMobile: true, hasVideo: false })).toBe("full-bleed");
  });

  it("1.9 is the stacking threshold", () => {
    expect(resolveHeroLayout({ ratio: 1.9, isMobile: true, hasVideo: false })).toBe("stacked");
    expect(resolveHeroLayout({ ratio: 1.89, isMobile: true, hasVideo: false })).toBe("full-bleed");
  });

  it("video slides stack on mobile once their poster ratio is known", () => {
    expect(resolveHeroLayout({ ratio: 1, isMobile: true, hasVideo: true })).toBe("stacked");
    expect(resolveHeroLayout({ ratio: 2.56, isMobile: true, hasVideo: true })).toBe("stacked");
  });

  it("unknown ratio (not yet measured or probe failed) stays full-bleed", () => {
    expect(resolveHeroLayout({ ratio: null, isMobile: true, hasVideo: false })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: null, isMobile: true, hasVideo: true })).toBe("full-bleed");
    expect(resolveHeroLayout({ ratio: 0, isMobile: true, hasVideo: false })).toBe("full-bleed");
  });
});
