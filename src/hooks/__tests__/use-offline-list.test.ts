import { afterEach, describe, expect, it } from "vitest";
import { loadSnapshot, readOnlineStatus, saveSnapshot } from "@/hooks/use-offline-list";

function stubStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  return store;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { navigator?: unknown }).navigator;
});

describe("offline list snapshots (Spotify-style browsable cache)", () => {
  it("round-trips cached lists within the age window", () => {
    stubStorage();
    saveSnapshot("home:discover", { songs: [1, 2, 3] });
    expect(loadSnapshot<{ songs: number[] }>("home:discover")).toEqual({ songs: [1, 2, 3] });
  });

  it("misses on unknown keys and garbage", () => {
    stubStorage();
    expect(loadSnapshot("nope")).toBeNull();
    (globalThis as any).window.localStorage.setItem("wesu:snap:bad", "{oops");
    expect(loadSnapshot("bad")).toBeNull();
  });

  it("expires entries older than a week", () => {
    const store = stubStorage();
    store.set(
      "wesu:snap:old",
      JSON.stringify({ at: Date.now() - 8 * 24 * 3600 * 1000, data: [1] }),
    );
    expect(loadSnapshot("old")).toBeNull();
  });

  it("treats missing navigator as online (SSR/tests)", () => {
    expect(readOnlineStatus()).toBe(true);
  });
});
