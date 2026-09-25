import { describe, expect, it } from "vitest";
import { normalizeLencoOperator, normalizeZmPhone } from "../lenco.server";

describe("normalizeLencoOperator", () => {
  it("converts legacy Zambia payment-method values to Lenco API values", () => {
    expect(normalizeLencoOperator("mtn-zambia")).toBe("mtn");
    expect(normalizeLencoOperator("airtel_zambia")).toBe("airtel");
    expect(normalizeLencoOperator("zamtel-zm")).toBe("zamtel");
  });

  it("rejects an operator Lenco cannot process", () => {
    expect(() => normalizeLencoOperator("vodacom")).toThrow(
      "Unsupported Lenco mobile-money operator",
    );
  });
});

describe("normalizeZmPhone", () => {
  it("accepts valid Zambian numbers in any common format", () => {
    expect(normalizeZmPhone("0977 123 456")).toBe("260977123456");
    expect(normalizeZmPhone("0977123456")).toBe("260977123456");
    expect(normalizeZmPhone("+260977123456")).toBe("260977123456");
    expect(normalizeZmPhone("977123456")).toBe("260977123456");
  });

  it("rejects short, long, and wrong-prefix numbers", () => {
    for (const bad of ["097712345", "09771234567", "0881234567", "", "abc"]) {
      expect(() => normalizeZmPhone(bad)).toThrow("valid 10-digit Zambian");
    }
  });
});
