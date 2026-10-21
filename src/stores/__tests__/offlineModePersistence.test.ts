/**
 * Offline is the network's state, not a preference the listener has to manage.
 *
 * HISTORY
 *
 * This file used to pin the opposite promise: "Offline mode must survive a cold
 * start", persisted in localStorage with a document.cookie fallback. The switch
 * has been retired — YouTube and Spotify never ask the listener to understand a
 * mode, and neither do we now. Downloads-only playback is simply what being
 * disconnected means:
 *
 *   - hydrate() mirrors navigator.onLine into the store on every boot;
 *   - OfflineLifecycle mirrors the online/offline edges during a session.
 *
 * What must be pinned instead:
 *
 *   - a cold start with no connection boots downloads-only;
 *   - a cold start online streams — and a stale "1" left in localStorage or the
 *     cookie by the RETIRED switch must not resurrect it (an online phone must
 *     never wake up trapped in downloads-only);
 *   - hydrate is safe where even localStorage access throws.
 *
 * The store module holds process-level state, so each test resets it through the
 * public surface.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { offlineModeEnabled, useOfflineMode } from "@/stores/offline-mode";

const g = globalThis as {
  document?: unknown;
  window?: unknown;
  navigator: Navigator;
};

let savedDoc: unknown;
let savedWin: unknown;
const hadDoc = "document" in g;
const hadWin = "window" in g;

/** navigator.onLine has no plain setter — write it through defineProperty. */
function setOnLine(value: boolean): void {
  Object.defineProperty(g.navigator, "onLine", { value, configurable: true });
}

/**
 * Attach just enough DOM surface to represent what the RETIRED switch wrote:
 * a "wesu:offline-mode" localStorage entry and a "wesu-offline-mode" cookie.
 * hydrate reads neither, so poisoning it with both is the point.
 */
function poisonWithSwitchLeftovers(): void {
  const doc = (hadDoc ? (g.document as { cookie: string }) : ({} as { cookie: string }));
  doc.cookie = "wesu-offline-mode=1";
  if (!hadDoc) g.document = doc as unknown;

  const target = (hadWin ? g.window : ({} as object)) as object;
  const store = new Map<string, string>([["wesu:offline-mode", "1"]]);
  Object.defineProperty(target, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    configurable: true,
  });
  if (!hadWin) g.window = target as unknown;
}

beforeEach(() => {
  // Reset module state by forcing it off through the public API.
  useOfflineMode.getState().setEnabled(false);
});

afterEach(() => {
  useOfflineMode.getState().setEnabled(false);
  setOnLine(true); // jsdom's default, restored for suites that share the env
  if (hadDoc) g.document = savedDoc;
  else delete g.document;
  if (hadWin) g.window = savedWin;
  else delete g.window;
});

describe("offline follows the network, not a switch", () => {
  it("boots downloads-only when the browser reports no connection", () => {
    setOnLine(false);
    useOfflineMode.getState().hydrate();
    expect(useOfflineMode.getState().enabled).toBe(true);
    expect(offlineModeEnabled()).toBe(true);
  });

  it("boots streaming with a connection", () => {
    setOnLine(true);
    useOfflineMode.getState().hydrate();
    expect(useOfflineMode.getState().enabled).toBe(false);
    expect(offlineModeEnabled()).toBe(false);
  });

  it("a retired switch's leftovers cannot trap an ONLINE phone", () => {
    // The old surface wrote localStorage["wesu:offline-mode"]="1" plus a
    // wesu-offline-mode=1 cookie; hydrate reads NEITHER. Being online means
    // streaming again — that is the point of implicit offline.
    poisonWithSwitchLeftovers();
    setOnLine(true);
    useOfflineMode.getState().hydrate();
    expect(useOfflineMode.getState().enabled).toBe(false);
    expect(offlineModeEnabled()).toBe(false);
  });

  it("storage that throws cannot stop hydrate", () => {
    poisonWithSwitchLeftovers();
    const win = g.window as object;
    Object.defineProperty(win, "localStorage", {
      value: {
        getItem() {
          throw new Error("SecurityError");
        },
        setItem() {
          throw new Error("QuotaExceededError");
        },
      },
      configurable: true,
    });
    setOnLine(true);
    expect(() => useOfflineMode.getState().hydrate()).not.toThrow();
    expect(useOfflineMode.getState().enabled).toBe(false);
  });

  it("a boot without browser APIs stays ONLINE, not downloads-only", () => {
    // SSR (and any stripped environment) has no storage to read. The very first
    // render must never claim offline, or the HTML states downloads-only while
    // the hydrating client disagrees and rewrites the page in front of the
    // listener. `undefined` document/window stands in for that environment.
    savedDoc = hadDoc ? g.document : undefined;
    savedWin = hadWin ? g.window : undefined;
    g.document = undefined as unknown as Document;
    g.window = undefined as unknown as Window;
    setOnLine(true);
    expect(() => useOfflineMode.getState().hydrate()).not.toThrow();
    expect(useOfflineMode.getState().enabled).toBe(false);
  });

  it("setEnabled mirrors the lifecycle's observed edges", () => {
    // OfflineLifecycle owns this call in the app — the transition classifier is
    // unit-tested in components/__tests__/offlineLifecycle.test.ts. Here it is
    // only the read-back that matters, because the player consults the store
    // from outside React: a store edge the player cannot see is a silent bug.
    useOfflineMode.getState().setEnabled(true);
    expect(offlineModeEnabled()).toBe(true);
    useOfflineMode.getState().setEnabled(false);
    expect(offlineModeEnabled()).toBe(false);
  });
});
