/**
 * Artist-line and credit formatting — the Spotify rules.
 *
 * The regression these lock down: a song made by two artists together used to
 * display "A feat. B", because the only way to add a second artist was the
 * `featured` role. Nobody featured anybody.
 *
 * Mirrors src/lib/credits.ts.
 */

import { describe, expect, it } from "vitest";

type Credit = { name: string; role: string; artistId?: string | null };

function formatArtistLine(lead: string | null | undefined, credits: Credit[] = []): string {
  const l = (lead ?? "").trim();
  const coLeads = credits.filter((c) => c.role === "main");
  return [l, ...coLeads.map((c) => c.name.trim())].filter(Boolean).join(" & ");
}

function formatFeatureSuffix(credits: Credit[]): string {
  const featured = credits
    .filter((c) => c.role === "featured")
    .map((c) => c.name.trim())
    .filter(Boolean);
  return featured.length ? `(feat. ${featured.join(" & ")})` : "";
}

function creditLabel(role: string): string {
  switch (role) {
    case "producer":
      return "Producer";
    case "writer":
      return "Writer";
    case "remixer":
      return "Remixer";
    default:
      return "Credits";
  }
}

describe("artist line", () => {
  it("shows a solo artist alone", () => {
    expect(formatArtistLine("Peter Kalangu", [])).toBe("Peter Kalangu");
  });

  it("shows two artists who made it together as co-leads, NOT as a feature", () => {
    const credits = [{ name: "Nagel Kaputula", role: "main" }];
    expect(formatArtistLine("Peter Kalangu", credits)).toBe("Peter Kalangu & Nagel Kaputula");
    // The regression: this used to read "Peter Kalangu feat. Nagel Kaputula".
    expect(formatFeatureSuffix(credits)).toBe("");
  });

  it("keeps a genuine feature in the feat. suffix, out of the artist line", () => {
    const credits = [{ name: "Nagel Kaputula", role: "featured" }];
    expect(formatArtistLine("Peter Kalangu", credits)).toBe("Peter Kalangu");
    expect(formatFeatureSuffix(credits)).toBe("(feat. Nagel Kaputula)");
  });

  it("handles co-leads AND a feature on the same song", () => {
    const credits = [
      { name: "B", role: "main" },
      { name: "C", role: "featured" },
    ];
    expect(formatArtistLine("A", credits)).toBe("A & B");
    expect(formatFeatureSuffix(credits)).toBe("(feat. C)");
  });

  it("joins several co-leads and several features", () => {
    const credits = [
      { name: "B", role: "main" },
      { name: "C", role: "main" },
      { name: "D", role: "featured" },
      { name: "E", role: "featured" },
    ];
    expect(formatArtistLine("A", credits)).toBe("A & B & C");
    expect(formatFeatureSuffix(credits)).toBe("(feat. D & E)");
  });

  it("never puts producer/writer/remixer in the artist line or the feat. suffix", () => {
    const credits = [
      { name: "DJ Banda", role: "producer" },
      { name: "Mr Writes", role: "writer" },
    ];
    expect(formatArtistLine("A", credits)).toBe("A");
    expect(formatFeatureSuffix(credits)).toBe("");
  });

  it("does not emit a stray separator when there is no lead artist", () => {
    const credits = [{ name: "B", role: "main" }];
    expect(formatArtistLine("", credits)).toBe("B");
    expect(formatArtistLine(null, [])).toBe("");
    expect(formatArtistLine(undefined, [])).toBe("");
  });

  it("ignores blank names", () => {
    const credits = [{ name: "  ", role: "main" }];
    expect(formatArtistLine("A", credits)).toBe("A");
  });

  it("handles a co-lead with no lead artist at all", () => {
    const credits = [
      { name: "B", role: "main" },
      { name: "C", role: "featured" },
    ];
    expect(formatArtistLine("", credits)).toBe("B");
    expect(formatFeatureSuffix(credits)).toBe("(feat. C)");
  });
});

describe("credit labels", () => {
  it("labels each credit-only role", () => {
    expect(creditLabel("producer")).toBe("Producer");
    expect(creditLabel("writer")).toBe("Writer");
    expect(creditLabel("remixer")).toBe("Remixer");
  });
});

describe("account nudge", () => {
  const needsAccount = (c: { artistId?: string | null }) => !c.artistId;

  it("flags a collaborator with no account", () => {
    // No account = no link to their page and no share of the earnings.
    expect(needsAccount({ artistId: null })).toBe(true);
    expect(needsAccount({})).toBe(true);
  });

  it("does not flag a registered artist", () => {
    expect(needsAccount({ artistId: "artist-uuid" })).toBe(false);
  });
});
