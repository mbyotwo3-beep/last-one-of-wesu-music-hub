/**
 * Regression tests for the whole-app audit fixes.
 *
 * Pure models mirroring the server/client rules introduced while fixing the
 * audit findings (stores/player selectionId rules live in
 * playbackSelection.test.ts). Runs in the node test env.
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// 1. Artist status clamp (artist.functions.ts :: clampArtistStatus)
// Artists may only use draft|pending; approved/rejected are staff-only.
// ---------------------------------------------------------------------------

type Status = "draft" | "pending" | "approved" | "rejected";

function clampArtistStatus(
  requested: Status | undefined,
  fallback: "draft" | "pending",
  isStaff: boolean,
): Status {
  const next = requested ?? fallback;
  if ((next === "approved" || next === "rejected") && !isStaff) {
    throw new Error("Only staff can approve or reject content");
  }
  return next;
}

describe("Artist status clamp", () => {
  it("artists can set draft or pending", () => {
    expect(clampArtistStatus("draft", "draft", false)).toBe("draft");
    expect(clampArtistStatus("pending", "draft", false)).toBe("pending");
    expect(clampArtistStatus(undefined, "pending", false)).toBe("pending");
  });

  it("artists cannot self-approve or self-reject", () => {
    expect(() => clampArtistStatus("approved", "draft", false)).toThrow();
    expect(() => clampArtistStatus("rejected", "pending", false)).toThrow();
  });

  it("staff can set any status", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Status>("draft", "pending", "approved", "rejected"),
        (s) => {
          expect(clampArtistStatus(s, "draft", true)).toBe(s);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Payout request validation (artist.functions.ts :: requestPayout)
// ---------------------------------------------------------------------------

function validatePayoutRequest(d: { amount: unknown; method_code: unknown; destination: unknown }) {
  const amount = Number(d.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payout amount must be a positive number");
  }
  if (typeof d.method_code !== "string" || !d.method_code.trim()) {
    throw new Error("A payout method is required");
  }
  if (typeof d.destination !== "string" || !d.destination.trim()) {
    throw new Error("A payout destination is required");
  }
  return amount;
}

describe("Payout request validation", () => {
  it("rejects NaN, Infinity, zero and negatives (NaN passes every </> check)", () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -5, "abc", undefined, null]) {
      expect(() => validatePayoutRequest({ amount: bad, method_code: "mtn", destination: "0977" })).toThrow();
    }
  });

  it("rejects blank method/destination", () => {
    expect(() => validatePayoutRequest({ amount: 600, method_code: "  ", destination: "0977" })).toThrow();
    expect(() => validatePayoutRequest({ amount: 600, method_code: "mtn", destination: "" })).toThrow();
  });

  it("accepts a well-formed request", () => {
    expect(validatePayoutRequest({ amount: 600, method_code: "mtn", destination: "0977" })).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// 3. Available balance must deduct every non-terminal payout status
// (approving a payout previously never reduced the balance → double spend)
// ---------------------------------------------------------------------------

const COMMITTED_STATUSES = ["pending", "approved", "processing", "paid", "completed"];

function availableBalance(earned: number, payouts: { amount: number; status: string }[]): number {
  const spent = payouts
    .filter((p) => COMMITTED_STATUSES.includes(p.status))
    .reduce((s, p) => s + p.amount, 0);
  return Math.max(0, earned - spent);
}

describe("Payout balance deduction", () => {
  it("an approved payout reduces the available balance", () => {
    expect(availableBalance(1000, [{ amount: 600, status: "approved" }])).toBe(400);
  });

  it("rejected/failed payouts do not reduce the balance", () => {
    expect(
      availableBalance(1000, [
        { amount: 600, status: "rejected" },
        { amount: 100, status: "failed" },
      ]),
    ).toBe(1000);
  });

  it("never goes negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.array(
          fc.record({
            amount: fc.integer({ min: 0, max: 5000 }),
            status: fc.constantFrom("pending", "approved", "processing", "paid", "completed", "rejected", "failed"),
          }),
          { maxLength: 8 },
        ),
        (earned, payouts) => {
          expect(availableBalance(earned, payouts)).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Webhook failure classification (lenco-webhook.ts)
// "cancelled" must settle as failed, never strand a row in pending.
// ---------------------------------------------------------------------------

function classifyWebhook(event: string, status: string): "success" | "failure" | "pending" | "ignore" {
  const isSuccess =
    event.endsWith(".successful") || status === "successful" || status === "success";
  const isFailure =
    event.endsWith(".failed") ||
    event.endsWith(".cancelled") ||
    status === "failed" ||
    status === "declined" ||
    status === "cancelled";
  const isPending =
    status === "pay-offline" || status === "pending" || event.endsWith(".pending");
  if (isPending && !isSuccess && !isFailure) return "pending";
  if (isSuccess) return "success";
  if (isFailure) return "failure";
  return "ignore";
}

describe("Webhook classification", () => {
  it("cancelled events and statuses settle as failure", () => {
    expect(classifyWebhook("collection.cancelled", "cancelled")).toBe("failure");
    expect(classifyWebhook("whatever", "cancelled")).toBe("failure");
    expect(classifyWebhook("collection.failed", "failed")).toBe("failure");
  });

  it("success still wins", () => {
    expect(classifyWebhook("collection.successful", "successful")).toBe("success");
  });

  it("pay-offline stays pending", () => {
    expect(classifyWebhook("collection.pending", "pay-offline")).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// 5. Pricing bounds (artist.functions.ts vs pricing config)
// ---------------------------------------------------------------------------

function checkSongPrice(price: number, min: number, max: number) {
  if (!Number.isFinite(price) || price < 0 || price > max) throw new Error("range");
  if (price > 0 && price < min) throw new Error("min");
}

describe("Pricing bounds", () => {
  it("free (0) passes bounds; below-min and above-max paid prices fail", () => {
    expect(() => checkSongPrice(0, 10, 100)).not.toThrow();
    expect(() => checkSongPrice(5, 10, 100)).toThrow();
    expect(() => checkSongPrice(101, 10, 100)).toThrow();
    expect(() => checkSongPrice(50, 10, 100)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. CMS carousel link classification (CarouselShelf.tsx)
// Unknown internal paths must not reach the router.
// ---------------------------------------------------------------------------

const KNOWN_ROUTES = [
  "/albums/",
  "/artists/",
  "/songs/",
  "/playlists/",
  "/labels/",
  "/browse",
  "/search",
  "/library",
  "/liked-songs",
  "/hot-tracks",
  "/recently-added",
  "/",
];

function isInternalLink(url: string): boolean {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return false;
  return KNOWN_ROUTES.some((r) => (r === "/" ? url === "/" : url.startsWith(r)));
}

function renderAs(url: string): "link" | "external" | "plain" {
  if (isInternalLink(url)) return "link";
  if (/^https?:\/\//i.test(url)) return "external";
  return "plain";
}

describe("Carousel link classification", () => {
  it("known routes use SPA links", () => {
    expect(renderAs("/albums/123")).toBe("link");
    expect(renderAs("/browse")).toBe("link");
  });

  it("unknown internal paths render plain (never crash the router)", () => {
    expect(renderAs("/nonexistent")).toBe("plain");
    expect(renderAs("/albums")).toBe("plain");
    expect(renderAs("")).toBe("plain");
  });

  it("protocol-relative URLs are not treated as internal", () => {
    expect(renderAs("//evil.com/x")).toBe("plain");
  });

  it("http(s) URLs open externally", () => {
    expect(renderAs("https://example.com/x")).toBe("external");
  });
});
