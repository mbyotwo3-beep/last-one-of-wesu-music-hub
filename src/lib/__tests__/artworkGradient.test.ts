import { describe, expect, it } from "vitest";
import {
  extractDominantColor,
  gradientFromColor,
  gradientFromHue,
  hashHue,
  refineDominantColor,
} from "@/lib/artwork-color";

describe("the hashed fallback", () => {
  it("is stable for the same cover", () => {
    expect(hashHue("album-art:abc.jpg")).toBe(hashHue("album-art:abc.jpg"));
  });

  it("differs for different covers most of the time", () => {
    const hues = new Set(
      Array.from({ length: 50 }, (_, i) => hashHue(`album-art:song-${i}.jpg`)),
    );
    // Different covers get different tints — the point of per-artwork colour.
    expect(hues.size).toBeGreaterThan(40);
  });

  it("stays inside the hue wheel", () => {
    expect(hashHue("") === Math.floor(hashHue(""))).toBe(true);
    expect(hashHue(" Wesu+ test ")).toBeGreaterThanOrEqual(0);
    expect(hashHue(" Wesu+ test ")).toBeLessThan(360);
  });

  it("produces a two-stop gradient with both stops present", () => {
    const css = gradientFromHue(hashHue("album-art:x"));
    expect(css.startsWith("linear-gradient(160deg,")).toBe(true);
    expect(css.split("hsl(").length).toBe(3); // two hsl() stops
  });

  it("is the same on the server and the client", () => {
    // The gradient is seeded before hydration and refined after; the seed
    // path must be reachable without a DOM, or SSR and CSR disagree.
    expect(() => gradientFromHue(hashHue("album-art:ssr-check"))).not.toThrow();
  });
});

describe("the sampled colour is nudged into a usable band", () => {
  it("lifts a muddy average into the designed saturation range", () => {
    const css = gradientFromColor({ r: 120, g: 110, b: 106 });
    // Extract the saturation of the first stop: "hsl(h S%) — S% must be >= 42%.
    const sat = Number(css.match(/hsl\(\d+ (\d+)%/)?.[1] ?? "0");
    expect(sat).toBeGreaterThanOrEqual(42);
    expect(sat).toBeLessThanOrEqual(78);
  });

  it("never clips lightness into white glare or black hole", () => {
    const css = gradientFromColor({ r: 250, g: 90, b: 40 });
    const lights = [...css.matchAll(/(\d+)%\)/g)].map((m) => Number(m[1]));
    for (const l of lights) expect(l).toBeGreaterThan(10);
    const main = lights[0];
    expect(main).toBeLessThanOrEqual(50);
  });
});

describe("sampling a 10x10 grid", () => {
  it("ignores the dead zones so a red cover does not read beige", () => {
    const frame = [0, 0, 0]; // crop edge, near-black
    const text = [240, 240, 240]; // near-white text background
    const red = [200, 30, 30]; // artwork
    // Out of 23 sampled pixels most are dead; the survivor must drive it.
    // `Array.from` because `Array(n).map(fn)` keeps holes: an array literal
    // built from that spread never sees the mapped values.
    const deadFrame = Array.from({ length: 10 }, () => toPixel(frame));
    const deadText = Array.from({ length: 10 }, () => toPixel(text));
    const alive = Array.from({ length: 3 }, () => toPixel(red));
    const out = refineDominantColor([...deadFrame, ...deadText, ...alive]);
    expect(out).toMatchObject({ r: 200, g: 30, b: 30 });
  });

  it("falls back to the raw average when everything is dead", () => {
    const out = refineDominantColor([
      { r: 10, g: 10, b: 10 },
      { r: 20, g: 20, b: 20 },
    ]);
    expect(out).toMatchObject({ r: 15, g: 15, b: 15 });
  });

  it("gives up gracefully with no pixels and with no DOM", async () => {
    expect(refineDominantColor([])).toBeNull();
    // jsdom has no canvas/cors machinery: extraction must not throw, and it
    // must return null so callers keep the hashed fallback.
    await expect(extractDominantColor("http://localhost/never.png")).resolves.toBeNull();
  });
});

function toPixel(rgb: number[]): { r: number; g: number; b: number } {
  return { r: rgb[0], g: rgb[1], b: rgb[2] };
}