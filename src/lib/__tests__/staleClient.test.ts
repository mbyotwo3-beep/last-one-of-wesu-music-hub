import { describe, expect, it } from "vitest";
import {
  indexAssetFromHtml,
  indexAssetFromScripts,
  isStaleClient,
  shouldAutoReload,
} from "../stale-client";

describe("stale client detection", () => {
  it("extracts the index bundle from script srcs", () => {
    expect(
      indexAssetFromScripts([
        "https://www.wesuplus.com/assets/vendor-abc.js",
        "https://www.wesuplus.com/assets/index-BieVXSXY.js",
      ]),
    ).toBe("/assets/index-BieVXSXY.js");
    expect(indexAssetFromScripts([])).toBeNull();
  });

  it("extracts the index bundle from live HTML", () => {
    expect(
      indexAssetFromHtml('<script type="module" src="/assets/index-new_1.js"></script>'),
    ).toBe("/assets/index-new_1.js");
    expect(indexAssetFromHtml("<html></html>")).toBeNull();
  });

  it("only calls it stale when both sides are known and differ", () => {
    expect(isStaleClient("/assets/index-a.js", "/assets/index-b.js")).toBe(true);
    expect(isStaleClient("/assets/index-a.js", "/assets/index-a.js")).toBe(false);
    expect(isStaleClient(null, "/assets/index-a.js")).toBe(false);
    expect(isStaleClient("/assets/index-a.js", null)).toBe(false);
  });

  it("auto-reloads a native, online, stale client once per cooldown", () => {
    const base = {
      isNative: true,
      online: true,
      loaded: "/assets/index-old.js",
      live: "/assets/index-new.js",
      lastCheckMs: 0,
      nowMs: 1_000_000,
    };
    expect(shouldAutoReload(base)).toBe(true);
    expect(shouldAutoReload({ ...base, isNative: false })).toBe(false);
    expect(shouldAutoReload({ ...base, online: false })).toBe(false);
    expect(shouldAutoReload({ ...base, live: base.loaded })).toBe(false);
    expect(shouldAutoReload({ ...base, lastCheckMs: base.nowMs - 1000 })).toBe(false);
  });
});
