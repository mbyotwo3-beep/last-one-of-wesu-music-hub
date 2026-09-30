import { describe, expect, it } from "vitest";
import { isSlug, isUuid } from "@/lib/route-params";

describe("route param guards", () => {
  it("accepts canonical uuids and normalises nothing silently wrong", () => {
    expect(isUuid("3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d")).toBe(true);
    expect(isUuid("3F1B2C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D")).toBe(true);
    expect(isUuid(" 3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d ")).toBe(true);
    // Postgres uuid v1-v8 range in the version nibble.
    expect(isUuid("3f1b2c4d-5e6f-1a7b-8c9d-0e1f2a3b4c5d")).toBe(true);
  });

  it("rejects every shape that crashes a uuid column", () => {
    // The exact inputs that produced
    // "Failed: invalid input syntax for type uuid" on live pages.
    expect(isUuid("does-not-exist")).toBe(false);
    expect(isUuid("1")).toBe(false);
    expect(isUuid("12345")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("null")).toBe(false);
    expect(isUuid("undefined")).toBe(false);
    expect(isUuid("abc-def")).toBe(false);
    // Right length, wrong characters.
    expect(isUuid("3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5z")).toBe(false);
    // Underscores, not hyphens.
    expect(isUuid("3f1b2c4d_5e6f_4a7b_8c9d_0e1f2a3b4c5d")).toBe(false);
    // No dashes at all.
    expect(isUuid("3f1b2c4d5e6f4a7b8c9d0e1f2a3b4c5d")).toBe(false);
    // Quote injection attempt must never reach the query builder.
    expect(isUuid("' OR 1=1 --")).toBe(false);
    expect(isUuid('"; drop table songs; --')).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid({})).toBe(false);
    expect(isUuid([])).toBe(false);
  });

  it("accepts plain slugs and rejects anything hostile", () => {
    expect(isSlug("diamond-platez")).toBe(true);
    expect(isSlug("Zambian_Gospel_2026")).toBe(true);
    expect(isSlug("a")).toBe(true);
    expect(isSlug("")).toBe(false);
    expect(isSlug("has space")).toBe(false);
    expect(isSlug("../etc/passwd")).toBe(false);
    expect(isSlug("slug/other")).toBe(false);
    expect(isSlug("'; drop --")).toBe(false);
    expect(isSlug("x".repeat(200))).toBe(false);
    expect(isSlug(null)).toBe(false);
  });
});
