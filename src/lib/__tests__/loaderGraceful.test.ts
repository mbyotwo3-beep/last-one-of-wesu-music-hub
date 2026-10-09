/**
 * Loader behaviour with the network off.
 *
 * A tester reported the app unusable offline. The shell cache fixed booting, but
 * these loaders were the next layer down and had been written under a different
 * assumption — that a failed fetch should surface.
 *
 * That assumption was correct when the app could not boot offline at all: there,
 * a thrown error was better than a silently empty page. Once the shell caches,
 * it inverted. Every one of these routes reads its data through useOfflineList,
 * which renders the last snapshot when a query fails offline — so a throwing
 * loader was overriding a working fallback with an error screen.
 *
 * The album case was the worst: it threw notFound(), telling someone an album
 * they had PAID FOR did not exist, because they lost signal.
 */
import { describe, expect, it } from "vitest";

import {
  isOfflineTransportFailure,
  isRedirect,
  loaderGraceful,
  loaderGracefulAll,
} from "@/lib/loader-graceful";

describe("isRedirect", () => {
  it("recognises notFound and router redirects", () => {
    expect(isRedirect({ isNotFound: true })).toBe(true);
    expect(isRedirect({ to: "/albums" })).toBe(true);
    expect(isRedirect({ href: "/albums" })).toBe(true);
  });

  it("does not claim an ordinary error is a redirect", () => {
    expect(isRedirect(new Error("boom"))).toBe(false);
    expect(isRedirect(null)).toBe(false);
    expect(isRedirect(undefined)).toBe(false);
    expect(isRedirect("not found")).toBe(false);
  });
});

describe("isOfflineTransportFailure", () => {
  it("recognises the browser's connection failures", () => {
    // These are what a server function called over fetch actually throws when
    // the device is offline. There is no useful code — only the message.
    for (const m of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
      "net::ERR_INTERNET_DISCONNECTED",
      "net::ERR_NAME_NOT_RESOLVED",
    ]) {
      expect(isOfflineTransportFailure(new Error(m))).toBe(true);
    }
  });

  it("does NOT claim a genuine server error is offline", () => {
    // The asymmetry is deliberate: mistaking a real failure for offline shows a
    // stale page (recoverable). The reverse tells someone their purchase is
    // gone when it is not.
    expect(isOfflineTransportFailure(new Error("500 Internal Server Error"))).toBe(false);
    expect(isOfflineTransportFailure(new Error("duplicate key"))).toBe(false);
  });

  it("never treats a notFound as offline", () => {
    // The exact bug: an album that genuinely does not exist must keep saying so.
    expect(isOfflineTransportFailure({ isNotFound: true })).toBe(false);
  });

  it("does not treat an abort as offline", () => {
    // An abort means the app moved on, not that the network is gone.
    const err = new Error("The user aborted a request.");
    err.name = "AbortError";
    expect(isOfflineTransportFailure(err)).toBe(false);
  });
});

describe("loaderGraceful", () => {
  it("returns the data when the fetch works", async () => {
    await expect(loaderGraceful(Promise.resolve(["a"]), [])).resolves.toEqual(["a"]);
  });

  it("falls back instead of throwing", async () => {
    await expect(loaderGraceful(Promise.reject(new Error("Failed to fetch")), [])).resolves.toEqual(
      [],
    );
  });
});

describe("loaderGracefulAll", () => {
  it("never rejects, whatever mix of types it is given", async () => {
    // /browse passes seven shelves of five different shapes. An earlier generic
    // signature collapsed them to one inferred type and the build caught it.
    await expect(
      loaderGracefulAll([
        Promise.reject(new Error("Failed to fetch")),
        Promise.resolve([{ id: "1", title: "x" }]),
        Promise.reject(new TypeError("Failed to fetch")),
        Promise.resolve({ nested: { ok: true } }),
      ]),
    ).resolves.toBeUndefined();
  });

  it("returns void so callers cannot depend on a value", async () => {
    const out = await loaderGracefulAll([Promise.resolve(1)]);
    expect(out).toBeUndefined();
  });
});
