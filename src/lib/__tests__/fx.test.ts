import { describe, expect, it } from "vitest";
import { FX_FALLBACK_ZMW_PER_USD, parseZmwPerUsd } from "@/lib/fx.functions";

describe("live FX rate parser (display-only USD)", () => {
  it("extracts the ZMW rate from a feed payload", () => {
    expect(parseZmwPerUsd({ result: "success", rates: { USD: 1, ZMW: 26.42 } })).toBe(26.42);
  });

  it("accepts numeric strings", () => {
    expect(parseZmwPerUsd({ rates: { ZMW: "26.42" } })).toBe(26.42);
  });

  it("rejects missing, zero, negative, and absurd rates", () => {
    expect(parseZmwPerUsd({ rates: { USD: 1 } })).toBeNull();
    expect(parseZmwPerUsd({ rates: { ZMW: 0 } })).toBeNull();
    expect(parseZmwPerUsd({ rates: { ZMW: -5 } })).toBeNull();
    expect(parseZmwPerUsd({ rates: { ZMW: "N/A" } })).toBeNull();
    expect(parseZmwPerUsd({ rates: { ZMW: 1e12 } })).toBeNull();
    expect(parseZmwPerUsd(null)).toBeNull();
    expect(parseZmwPerUsd("garbage")).toBeNull();
  });

  it("keeps a sane fallback so USD display never breaks", () => {
    expect(FX_FALLBACK_ZMW_PER_USD).toBeGreaterThan(0);
  });
});
