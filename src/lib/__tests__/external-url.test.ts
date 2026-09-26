import { afterEach, describe, expect, it } from "vitest";
import { copyTextToClipboard, isNativeShell, openExternalUrl } from "@/lib/external-url";

type W = { Capacitor?: { isNativePlatform?: () => boolean } };

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
    writable: true,
  });
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("external-url parity helpers", () => {
  it("detects the native shell only when Capacitor reports native", () => {
    const w: W = {};
    setWindow(w);

    expect(isNativeShell()).toBe(false);

    w.Capacitor = { isNativePlatform: () => true };
    expect(isNativeShell()).toBe(true);

    delete w.Capacitor;
    expect(isNativeShell()).toBe(false);
  });

  it("never throws when clipboard is unavailable (WebView reality)", async () => {
    // Node test env has no navigator.clipboard — the exact failure mode
    // that used to reject unhandled in the app shell.
    await expect(copyTextToClipboard("https://example.com")).resolves.toBe(false);
  });

  it("reports success when the clipboard accepts the text", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const written: string[] = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: async (t: string) => {
            written.push(t);
          },
        },
      },
    });
    try {
      await expect(copyTextToClipboard("hello")).resolves.toBe(true);
      expect(written).toEqual(["hello"]);
    } finally {
      if (original) Object.defineProperty(globalThis, "navigator", original);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it("is a no-op outside the browser instead of crashing", async () => {
    // No window defined (SSR / node tests) — must resolve, not throw.
    await expect(openExternalUrl("https://example.com")).resolves.toBeUndefined();
  });
});
