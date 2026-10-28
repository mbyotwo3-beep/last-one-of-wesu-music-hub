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
import { sameOriginAppPath } from "@/lib/external-url";
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

  it("absolute URLs to the app's own site are internal (tester report regression)", () => {
    // Admin pasted the full share URL; even flagged external:true + native,
    // the app must never open its own page in a browser.
    expect(
      resolveHeroCta({
        link: "https://www.wesuplus.com/albums/1",
        external: true,
        target: "_blank",
        isNative: true,
      }),
    ).toEqual({ mode: "spa", url: "/albums/1" });
  });

  it("apex host (no www) counts as self too", () => {
    expect(
      resolveHeroCta({
        link: "https://wesuplus.com/artists/2",
        external: false,
        isNative: true,
      }),
    ).toEqual({ mode: "spa", url: "/artists/2" });
  });

  it("self URLs keep search and hash", () => {
    expect(
      resolveHeroCta({
        link: "https://www.wesuplus.com/playlists/3?x=1#top",
        external: true,
        isNative: true,
      }),
    ).toEqual({ mode: "spa", url: "/playlists/3?x=1#top" });
  });

  it("foreign URLs are unaffected by the self-host check", () => {
    expect(
      resolveHeroCta({
        link: "https://example.com/wesuplus.com",
        external: false,
        isNative: true,
      }),
    ).toEqual({ mode: "in-app", url: "https://example.com/wesuplus.com" });
  });
});

describe("sameOriginAppPath", () => {
  it("maps self hosts to their internal path", () => {
    expect(sameOriginAppPath("https://www.wesuplus.com/albums/1")).toBe("/albums/1");
    expect(sameOriginAppPath("https://wesuplus.com/artists/2")).toBe("/artists/2");
    expect(sameOriginAppPath("https://www.wesuplus.com/playlists/3?x=1#top")).toBe(
      "/playlists/3?x=1#top",
    );
    expect(sameOriginAppPath("https://www.wesuplus.com")).toBe("/");
    expect(sameOriginAppPath("http://wesuplus.com/bare")).toBe("/bare");
  });

  it("matches the caller-provided origin", () => {
    expect(sameOriginAppPath("http://localhost:5173/browse", "http://localhost:5173")).toBe(
      "/browse",
    );
  });

  it("returns null for foreign, relative, and malformed input", () => {
    expect(sameOriginAppPath("https://example.com/x")).toBeNull();
    expect(sameOriginAppPath("http://evilwww.wesuplus.com/")).toBeNull();
    expect(sameOriginAppPath("/albums/1")).toBeNull();
    expect(sameOriginAppPath("")).toBeNull();
    expect(sameOriginAppPath(null)).toBeNull();
    expect(sameOriginAppPath(undefined)).toBeNull();
    expect(sameOriginAppPath(42)).toBeNull();
  });

  it("is not fooled by //host or subdomain lookalikes", () => {
    expect(sameOriginAppPath("https://wesuplus.com.evil.com/x")).toBeNull();
    expect(sameOriginAppPath("https://wesuplus.com.evil.com")).toBeNull();
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
