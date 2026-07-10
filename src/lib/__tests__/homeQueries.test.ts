/**
 * Property-based tests for home data queries staleTime.
 *
 * Feature: wesu-plus-completion, Property 21: Home data queries respect 5-minute staleTime
 * Validates: Requirements 17.4
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { newReleasesQO, trendingQO, featuredQO } from "@/components/mobile/screens/MobileHome";

const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300_000 ms

// ---------------------------------------------------------------------------
// Property 21: Home data queries respect 5-minute staleTime
// Feature: wesu-plus-completion, Property 21: Home data queries respect 5-minute staleTime
// Validates: Requirements 17.4
// ---------------------------------------------------------------------------

describe("Property 21: Home data query staleTime is exactly 5 minutes", () => {
  it("newReleasesQO staleTime should be exactly 5 minutes (300_000 ms)", () => {
    expect(newReleasesQO.staleTime).toBe(FIVE_MINUTES_MS);
  });

  it("trendingQO staleTime should be exactly 5 minutes (300_000 ms)", () => {
    expect(trendingQO.staleTime).toBe(FIVE_MINUTES_MS);
  });

  it("featuredQO staleTime should be exactly 5 minutes (300_000 ms)", () => {
    expect(featuredQO.staleTime).toBe(FIVE_MINUTES_MS);
  });

  it("staleTime should be >= 5 minutes for all home queries", () => {
    const queries = [newReleasesQO, trendingQO, featuredQO];
    for (const q of queries) {
      expect(q.staleTime).toBeGreaterThanOrEqual(FIVE_MINUTES_MS);
    }
  });

  it("staleTime value represents 5 minutes in milliseconds for any equivalent formulation", () => {
    // Property: 5 * 60 * 1000 always equals 300000
    fc.assert(
      fc.property(fc.constant(5), (minutes) => {
        const ms = minutes * 60 * 1000;
        expect(ms).toBe(300_000);
        expect(newReleasesQO.staleTime).toBe(ms);
        expect(trendingQO.staleTime).toBe(ms);
        expect(featuredQO.staleTime).toBe(ms);
      }),
      { numRuns: 1 },
    );
  });

  it("all three home query staleTime values are equal", () => {
    expect(newReleasesQO.staleTime).toBe(trendingQO.staleTime);
    expect(trendingQO.staleTime).toBe(featuredQO.staleTime);
  });

  it("query keys are correct for cache identification", () => {
    expect(newReleasesQO.queryKey).toEqual(["new-releases"]);
    expect(trendingQO.queryKey).toEqual(["trending"]);
    expect(featuredQO.queryKey).toEqual(["featured-albums"]);
  });
});
