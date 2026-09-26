import { describe, expect, it } from "vitest";
import { validateCommissionPct, validateSettingsValue } from "@/lib/settings-validation";

describe("platform settings validation (misconfig breaks flows globally)", () => {
  it("accepts sane site settings", () => {
    expect(
      validateSettingsValue("site", {
        url: "https://www.wesuplusly.com",
        commission_pct: 20,
        support_email: "support@wesu.app",
        mobile_app_url: "",
      }),
    ).toBeNull();
  });

  it("rejects a bad site URL, commission, email, or app link", () => {
    expect(validateSettingsValue("site", { url: "not a url" })).toMatch(/URL/);
    expect(validateSettingsValue("site", { url: "ftp://x.com" })).toMatch(/URL/);
    expect(validateSettingsValue("site", { commission_pct: 150 })).toMatch(/commission_pct/);
    expect(validateSettingsValue("site", { commission_pct: -1 })).toMatch(/commission_pct/);
    expect(validateSettingsValue("site", { support_email: "nope" })).toMatch(/email/);
    expect(validateSettingsValue("site", { ios_app_url: "notaurl" })).toMatch(/ios_app_url/);
  });

  it("rejects negative or inverted pricing caps", () => {
    expect(validateSettingsValue("pricing", { song_min: 10, song_max: 100 })).toBeNull();
    expect(validateSettingsValue("pricing", { song_max: -5 })).toMatch(/song_max/);
    expect(validateSettingsValue("pricing", { song_min: 200, song_max: 100 })).toMatch(/higher/);
    expect(validateSettingsValue("pricing", { album_min: 300, album_max: 250 })).toMatch(/higher/);
  });

  it("validates withdrawal, verification, and payments rows", () => {
    expect(validateSettingsValue("withdrawal", { min_amount: 500 })).toBeNull();
    expect(validateSettingsValue("withdrawal", { min_amount: -1 })).toMatch(/min_amount/);
    expect(validateSettingsValue("verification", { min_followers: 100 })).toBeNull();
    expect(validateSettingsValue("payments", { lenco_mode: "live" })).toBeNull();
    expect(validateSettingsValue("payments", { lenco_mode: "yolo" })).toMatch(/sandbox/);
  });

  it("refuses non-objects and unknown keys", () => {
    expect(validateSettingsValue("site", null)).toMatch(/object/);
    expect(validateSettingsValue("nope", {})).toMatch(/Unknown settings key/);
  });

  it("validates the standalone commission setter", () => {
    expect(validateCommissionPct(20)).toBeNull();
    expect(validateCommissionPct(0)).toBeNull();
    expect(validateCommissionPct(100)).toBeNull();
    expect(validateCommissionPct(101)).toMatch(/between 0 and 100/);
    expect(validateCommissionPct("abc")).toMatch(/between 0 and 100/);
  });
});
