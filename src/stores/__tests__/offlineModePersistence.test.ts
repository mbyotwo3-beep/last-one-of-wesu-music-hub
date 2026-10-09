/**
 * Offline mode must survive a cold start.
 *
 * The WebView on a phone is killed constantly — by the OS, by a battery
 * optimiser, by the listener swiping the app away. A mode that resets itself is
 * worse than no mode at all, because the listener believes they are listening
 * offline while the app quietly streams over their data.
 *
 * This file previously had NO persistence test: stubbing out the cookie fallback
 * left the whole suite green, which is exactly the kind of untested branch that
 * rots. The two failure modes being pinned are (a) localStorage unavailable, so
 * the cookie has to carry it, and (b) neither available, so it must fail safe to
 * OFF rather than trapping someone in a mode they cannot leave.
 *
 * The store module holds process-level state, so each test resets it through the
 * public surface.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { offlineModeEnabled, useOfflineMode } from "@/stores/offline-mode";

/** Minimal document.cookie jar — enough to prove the value round-trips. */
function fakeDom(opts: { localStorage?: "work" | "throw" | "absent" }): {
  doc: Record<string, unknown>;
  win: Record<string, unknown>;
  readCookie: () => string;
} {
  let cookie = "";
  const store = new Map<string, string>();
  const doc: Record<string, unknown> = {
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      const [pair] = v.split(";");
      const [k, val] = pair.split("=");
      if (v.includes("max-age=0") || val === "0") cookie = "";
      else cookie = cookie ? `${cookie}; ${k}=${val}` : `${k}=${val}`;
    },
  };

  const win: Record<string, unknown> = {};
  if (opts.localStorage === "work") {
    win.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  } else if (opts.localStorage === "throw") {
    win.localStorage = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("QuotaExceededError");
      },
    };
  }

  return { doc, win, readCookie: () => cookie };
}

const g = globalThis as Record<string, unknown>;
let savedDoc: unknown;
let savedWin: unknown;
const hadDoc = "document" in g;
const hadWin = "window" in g;

beforeEach(() => {
  savedDoc = g.document;
  savedWin = g.window;
  // Reset module state by forcing it off through the public API.
  useOfflineMode.getState().setEnabled(false);
  useOfflineMode.getState().hydrate();
});

afterEach(() => {
  useOfflineMode.getState().setEnabled(false);
  if (hadDoc) g.document = savedDoc;
  else delete g.document;
  if (hadWin) g.window = savedWin;
  else delete g.window;
});

describe("offline mode persistence", () => {
  it("remembers ON after a reload when localStorage works", () => {
    const { doc, win } = fakeDom({ localStorage: "work" });
    g.document = doc;
    g.window = win;

    useOfflineMode.getState().setEnabled(true);
    // Simulate the cold start: forget the in-memory value, keep the storage.
    useOfflineMode.setState({ enabled: false });
    useOfflineMode.getState().hydrate();

    expect(useOfflineMode.getState().enabled).toBe(true);
    expect(offlineModeEnabled()).toBe(true);
  });

  it("survives when localStorage throws — the cookie carries it", () => {
    // Private-mode / partitioned WebView: storage throws on every access. With
    // no fallback the mode silently reset on every launch.
    const { doc, win, readCookie } = fakeDom({ localStorage: "throw" });
    g.document = doc;
    g.window = win;

    useOfflineMode.getState().setEnabled(true);
    expect(readCookie()).toContain("wesu-offline-mode=1");

    useOfflineMode.setState({ enabled: false });
    useOfflineMode.getState().hydrate();
    expect(useOfflineMode.getState().enabled).toBe(true);
  });

  it("fails SAFE to off when nothing is available", () => {
    // No document, no window: must not throw and must not claim offline mode.
    delete g.document;
    delete g.window;
    expect(() => useOfflineMode.getState().setEnabled(true)).not.toThrow();
    useOfflineMode.setState({ enabled: false });
    useOfflineMode.getState().hydrate();
    expect(useOfflineMode.getState().enabled).toBe(false);
  });

  it("does not report offline mode during server render", () => {
    // The store module is evaluated on the server, where there is no storage.
    // If it booted true, the HTML and the first client render would disagree.
    delete g.document;
    delete g.window;
    useOfflineMode.setState({ enabled: false });
    expect(offlineModeEnabled()).toBe(false);
  });

  it("turning it off clears the stored value", () => {
    const { doc, win, readCookie } = fakeDom({ localStorage: "work" });
    g.document = doc;
    g.window = win;

    useOfflineMode.getState().setEnabled(true);
    useOfflineMode.getState().setEnabled(false);
    expect(readCookie()).not.toContain("wesu-offline-mode=1");

    useOfflineMode.setState({ enabled: true });
    useOfflineMode.getState().hydrate();
    expect(useOfflineMode.getState().enabled).toBe(false);
  });

  it("toggle flips and persists in one step", () => {
    const { doc, win } = fakeDom({ localStorage: "work" });
    g.document = doc;
    g.window = win;

    useOfflineMode.getState().toggle();
    expect(useOfflineMode.getState().enabled).toBe(true);

    useOfflineMode.setState({ enabled: false });
    useOfflineMode.getState().hydrate();
    expect(useOfflineMode.getState().enabled).toBe(true);
  });
});
