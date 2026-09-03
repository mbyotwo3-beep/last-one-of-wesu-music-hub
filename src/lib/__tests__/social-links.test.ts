import { describe, expect, it } from "vitest";
import { collectSocialLinks, normalizeSocialUrl } from "@/lib/social-links";

describe("artist social links", () => {
  it("normalizes a pasted web address to a safe URL", () => {
    expect(normalizeSocialUrl("instagram.com/wesuplus")).toBe("https://instagram.com/wesuplus");
  });

  it("rejects non-web URL schemes", () => {
    expect(normalizeSocialUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSocialUrl("mailto:artist@example.com")).toBeNull();
  });

  it("only exposes supported social platforms with valid links", () => {
    expect(
      collectSocialLinks({
        instagram: "https://instagram.com/wesuplus",
        youtube: "youtube.com/@wesuplus",
        unknown: "https://example.com",
        spotify: "javascript:alert(1)",
      }),
    ).toEqual([
      { key: "instagram", label: "Instagram", url: "https://instagram.com/wesuplus" },
      { key: "youtube", label: "YouTube", url: "https://youtube.com/@wesuplus" },
    ]);
  });
});
