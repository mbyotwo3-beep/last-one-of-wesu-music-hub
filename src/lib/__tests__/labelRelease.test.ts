/**
 * Tests for label release requests (src/lib/labels.functions.ts).
 *
 * Approved artists search existing labels by name and request them for a
 * release — no email needed. Money only routes after the label's own
 * approval, so the target rule (exactly one of song/album) is enforced
 * in a pure, unit-tested validator.
 *
 * Test framework : Vitest
 */

import { describe, it, expect } from "vitest";
import { validateLabelReleaseTarget } from "../labels.functions";

describe("validateLabelReleaseTarget", () => {
  it("accepts a song target", () => {
    expect(validateLabelReleaseTarget({ song_id: "s1" })).toBe("song");
  });

  it("accepts an album target", () => {
    expect(validateLabelReleaseTarget({ album_id: "a1" })).toBe("album");
  });

  it("rejects zero or two targets", () => {
    expect(() => validateLabelReleaseTarget({})).toThrow(
      "Provide exactly one of song_id or album_id",
    );
    expect(() => validateLabelReleaseTarget({ song_id: "s1", album_id: "a1" })).toThrow(
      "Provide exactly one of song_id or album_id",
    );
    expect(() => validateLabelReleaseTarget({ song_id: null, album_id: null })).toThrow();
  });
});
