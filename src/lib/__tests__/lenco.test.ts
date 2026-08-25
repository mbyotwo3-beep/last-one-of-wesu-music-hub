import { describe, expect, it } from "vitest";
import { normalizeLencoOperator } from "../lenco.server";

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
