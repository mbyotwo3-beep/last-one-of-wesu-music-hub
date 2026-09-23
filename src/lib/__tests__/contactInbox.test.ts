/**
 * Tests for the staff-owned support inbox (src/lib/contact.functions.ts).
 *
 * support@wesuplus.com doesn't exist, so /contact writes to a
 * support_messages table that only superadmin/admin users can read and
 * resolve. Validation is pure and unit-tested; RLS + staff gates mirror
 * the audit_log pattern (public.is_staff).
 *
 * Test framework : Vitest
 */

import { describe, it, expect } from "vitest";
import { validateSupportMessage } from "../contact.functions";

describe("validateSupportMessage", () => {
  it("accepts a complete message", () => {
    expect(
      validateSupportMessage({
        name: "Mutinta Phiri",
        email: "mutinta@example.com",
        subject: "Payment issue",
        message: "My mobile money prompt never arrived.",
      }),
    ).toBeNull();
  });

  it("rejects missing name, bad email, and empty message", () => {
    expect(validateSupportMessage({ name: "", email: "a@b.com", message: "hi" })).toBe(
      "Please tell us your name",
    );
    expect(validateSupportMessage({ name: "A", email: "not-an-email", message: "hi" })).toBe(
      "Enter a valid email address",
    );
    expect(validateSupportMessage({ name: "A", email: "a@b.com", message: "   " })).toBe(
      "Please write your message",
    );
  });

  it("rejects oversized fields", () => {
    expect(
      validateSupportMessage({ name: "A", email: "a@b.com", message: "x".repeat(5001) }),
    ).toBe("Message is too long (max 5000 characters)");
    expect(
      validateSupportMessage({
        name: "A",
        email: "a@b.com",
        subject: "x".repeat(121),
        message: "hi",
      }),
    ).toBe("Subject is too long (max 120 characters)");
  });
});
