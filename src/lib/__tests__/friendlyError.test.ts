/**
 * Tests for src/lib/friendly-error.ts.
 *
 * Dozens of routes rendered `{error.message}` verbatim, so a listener hitting
 * a token or edge-case failure saw server internals ("Missing Supabase
 * environment variable(s)…", "Unauthorized: Invalid token", raw PostgREST
 * JSON) on a page that looked broken. The rule under test: our own copy passes
 * through, everything else becomes a sentence someone can act on.
 */

import { describe, it, expect } from "vitest";
import { friendlyError, errorText } from "../friendly-error";

describe("errorText", () => {
  it("pulls a message out of anything throwable", () => {
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("plain string")).toBe("plain string");
    expect(errorText({ message: "from object" })).toBe("from object");
    expect(errorText({ error: "nested" })).toBe("nested");
    expect(errorText({ error_description: "oauth style" })).toBe("oauth style");
    expect(errorText(null)).toBe("");
    expect(errorText(undefined)).toBe("");
  });
});

describe("friendlyError — things a user can fix", () => {
  it("translates the common auth failures into plain words", () => {
    expect(friendlyError(new Error("Invalid login credentials"))).toContain("don't match");
    expect(friendlyError(new Error("User already registered"))).toContain("already exists");
    expect(friendlyError(new Error("Email not confirmed"))).toContain("Confirm your email");
    expect(friendlyError(new Error("Password should be at least 6 characters."))).toContain(
      "at least 6 characters",
    );
    expect(friendlyError(new Error("Too many requests, rate limit exceeded"))).toContain(
      "Wait a minute",
    );
  });

  it("translates connectivity failures", () => {
    expect(friendlyError(new Error("TypeError: Failed to fetch"))).toContain("No connection");
    expect(friendlyError(new Error("NetworkError when attempting to fetch"))).toContain(
      "No connection",
    );
  });

  it("translates an expired/absent session", () => {
    expect(friendlyError(new Error("Unauthorized: Invalid token"))).toContain("session expired");
    expect(friendlyError(new Error("JWT expired"))).toContain("session expired");
  });
});

describe("friendlyError — internals never leak", () => {
  it("replaces server configuration text", () => {
    const leaked =
      "Missing Supabase environment variable(s): SUPABASE_URL. Connect Supabase in Lovable Cloud.";
    const out = friendlyError(new Error(leaked));
    expect(out).not.toContain("SUPABASE_URL");
    expect(out).toBe("Something went wrong. Please try again.");
  });

  it("replaces raw JSON / SQL payloads", () => {
    const json = '{"code":"23505","message":"duplicate key value violates unique constraint"}';
    expect(friendlyError(new Error(json))).not.toContain("23505");
    expect(friendlyError(new Error('SELECT * FROM "songs" WHERE id = $1 failed'))).not.toContain(
      "SELECT",
    );
  });

  it("replaces anything suspiciously long", () => {
    const long = "x".repeat(400);
    expect(friendlyError(new Error(long))).toBe("Something went wrong. Please try again.");
  });

  it("uses the caller's fallback when given one", () => {
    expect(friendlyError(new Error("mystery gibberish"), "Could not load.")).toBe(
      "Could not load.",
    );
    expect(friendlyError(null, "Nothing to show.")).toBe("Nothing to show.");
    expect(friendlyError(undefined, "Nothing to show.")).toBe("Nothing to show.");
  });
});

describe("friendlyError — our own copy passes through", () => {
  it("keeps messages written for humans", () => {
    const messages = [
      "You must agree to the Terms & Conditions to create an account.",
      "Please acknowledge the K100 maintenance fee",
      "Enter a valid 10-digit Zambian mobile number",
      "Song not found",
      "Minimum withdrawal amount is K500",
      "Total splits would exceed 100% (currently 60%)",
      "That artist is already credited on this song",
      "Failed to send invite: network unreachable",
      "You can't invite yourself as a collaborator",
      "Offline storage is full (1.5 GB limit) — remove a download first",
    ];
    for (const m of messages) {
      expect(friendlyError(new Error(m))).toBe(m);
    }
  });
});
