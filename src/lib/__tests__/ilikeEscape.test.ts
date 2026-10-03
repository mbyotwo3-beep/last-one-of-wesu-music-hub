import { describe, expect, it } from "vitest";

/**
 * Mirrors escapeIlike in artist-studio.tsx: PostgREST `ilike` treats `%`, `_`
 * and `\` as wildcards/escape, so raw user input must be escaped before being
 * interpolated into a `%…%` pattern.
 */
function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

describe("ilike search escape", () => {
  it("escapes wildcard characters so names match literally", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("a_b")).toBe("a\\_b");
    expect(escapeIlike("back\\slash")).toBe("back\\\\slash");
    expect(escapeIlike("%%__\\\\")).toBe("\\%\\%\\_\\_\\\\\\\\");
  });

  it("leaves ordinary names untouched", () => {
    expect(escapeIlike("DJ Banda")).toBe("DJ Banda");
    expect(escapeIlike("Macky 2")).toBe("Macky 2");
    expect(escapeIlike("")).toBe("");
  });

  it("keeps the surrounding %…% pattern intact", () => {
    const q = `%${escapeIlike("100% hits")}%)`;
    expect(q).toBe("%100\\% hits%)");
  });
});
