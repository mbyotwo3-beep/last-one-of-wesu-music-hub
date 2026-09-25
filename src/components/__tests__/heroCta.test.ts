/**
 * Tests for hero CTA routing (resolveHeroCta in HeroCarousel.tsx).
 *
 * Admins choose per-slide: same tab, or new tab. On the native app there
 * are no tabs — external "new tab" links open the in-app browser overlay
 * (Facebook-Lite style) instead of stranding the user in the system
 * browser. Internal links always stay in-app.
 *
 * Test framework : Vitest
 */

import { describe, it, expect } from "vitest";
import { resolveHeroCta } from "../HeroCarousel";
import { normalizeLinkTarget } from "@/lib/hero-carousel.functions";

describe("resolveHeroCta", () => {
  it("internal paths always use SPA navigation", () => {
    expect(
      resolveHeroCta({ link: "/albums/1", external: false, target: "_blank", isNative: false }),
    ).toEqual({ mode: "spa", url: "/albums/1" });
    expect(
      resolveHeroCta({ link: "/browse", external: false, target: "_self", isNative: true }),
    ).toEqual({ mode: "spa", url: "/browse" });
  });

  it("web honors the admin target for external links", () => {
    expect(
      resolveHeroCta({
        link: "https://example.com/x",
        external: true,
        target: "_blank",
        isNative: false,
      }),
    ).toEqual({ mode: "new-tab", url: "https://example.com/x" });
    expect(
      resolveHeroCta({
        link: "https://example.com/x",
        external: true,
        target: "_self",
        isNative: false,
      }),
    ).toEqual({ mode: "same-tab", url: "https://example.com/x" });
  });

  it("native always opens external links in-app, either target", () => {
    for (const target of ["_self", "_blank", undefined]) {
      expect(
        resolveHeroCta({
          link: "https://example.com/x",
          external: true,
          target,
          isNative: true,
        }),
      ).toEqual({ mode: "in-app", url: "https://example.com/x" });
    }
  });

  it("absolute URLs are external even without the flag", () => {
    expect(
      resolveHeroCta({ link: "https://example.com/x", external: false, isNative: false }),
    ).toEqual({ mode: "same-tab", url: "https://example.com/x" });
  });

  it("empty links fall back to home", () => {
    expect(resolveHeroCta({ link: "", external: false, isNative: false })).toEqual({
      mode: "spa",
      url: "/",
    });
  });
});

describe("normalizeLinkTarget", () => {
  it("accepts _blank, defaults everything else to _self", () => {
    expect(normalizeLinkTarget("_blank")).toBe("_blank");
    expect(normalizeLinkTarget("_self")).toBe("_self");
    expect(normalizeLinkTarget(undefined)).toBe("_self");
    expect(normalizeLinkTarget("_top")).toBe("_self");
    expect(normalizeLinkTarget(null)).toBe("_self");
  });
});
