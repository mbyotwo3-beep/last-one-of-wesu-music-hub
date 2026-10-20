import { describe, expect, it } from "vitest";

import { routeRestoreDecision } from "@/lib/route-restore";

describe("reopening the app lands where the listener was", () => {
  it("restores a native boot to the recorded route", () => {
    expect(
      routeRestoreDecision({
        isNative: true,
        currentPath: "/",
        stored: "/library",
      }),
    ).toEqual({ action: "restore", to: "/library" });
  });

  it("keeps query strings — restores exact screen state", () => {
    expect(
      routeRestoreDecision({
        isNative: true,
        currentPath: "/",
        stored: "/browse?genre=Afrobeat",
      }),
    ).toEqual({ action: "restore", to: "/browse?genre=Afrobeat" });
  });

  it("never restores on the open web — the browser owns deep-linking", () => {
    expect(
      routeRestoreDecision({ isNative: false, currentPath: "/", stored: "/library" }),
    ).toEqual({ action: "stay" });
  });

  it("first launch boots home, correctly", () => {
    expect(routeRestoreDecision({ isNative: true, currentPath: "/", stored: null })).toEqual({
      action: "stay",
    });
  });

  it("a route already on screen never triggers a loop", () => {
    expect(
      routeRestoreDecision({ isNative: true, currentPath: "/library", stored: "/library" }),
    ).toEqual({ action: "stay" });
  });

  it("declines strings that are not routes — protocol-relative is an injection", () => {
    expect(
      routeRestoreDecision({ isNative: true, currentPath: "/", stored: "evil.example.com/x" }),
    ).toEqual({ action: "stay" });
    expect(
      routeRestoreDecision({ isNative: true, currentPath: "/", stored: "//evil.example.com/x" }),
    ).toEqual({ action: "stay" });
  });
});
