import { describe, expect, it } from "vitest";
import { parseAuthCallbackUrl } from "@/integrations/supabase/auth-deep-link";

describe("native auth deep-link parsing", () => {
  it("ignores non-callback URLs", () => {
    expect(parseAuthCallbackUrl("https://www.wesuplus.com/dashboard").isLoginCallback).toBe(
      false,
    );
  });

  it("parses token pairs from the query string", () => {
    const p = parseAuthCallbackUrl(
      "com.wesu.music://login-callback?access_token=AAA&refresh_token=BBB",
    );
    expect(p.isLoginCallback).toBe(true);
    expect(p.access_token).toBe("AAA");
    expect(p.refresh_token).toBe("BBB");
    expect(p.isRecovery).toBe(false);
  });

  it("parses tokens from the hash fragment (implicit flow)", () => {
    const p = parseAuthCallbackUrl(
      "com.wesu.music://login-callback#access_token=AAA&refresh_token=BBB",
    );
    expect(p.access_token).toBe("AAA");
    expect(p.refresh_token).toBe("BBB");
  });

  it("reads both sides of a mixed URL", () => {
    const p = parseAuthCallbackUrl(
      "com.wesu.music://login-callback?type=recovery#access_token=AAA&refresh_token=BBB",
    );
    expect(p.isRecovery).toBe(true);
    expect(p.access_token).toBe("AAA");
  });

  it("parses PKCE email-confirmation codes", () => {
    const p = parseAuthCallbackUrl("com.wesu.music://login-callback?code=PKCE123");
    expect(p.code).toBe("PKCE123");
    expect(p.access_token).toBeNull();
  });

  it("surfaces provider errors instead of exchanging", () => {
    const p = parseAuthCallbackUrl(
      "com.wesu.music://login-callback?error=access_denied&error_description=Denied",
    );
    expect(p.errorDescription).toBe("Denied");
  });
});
