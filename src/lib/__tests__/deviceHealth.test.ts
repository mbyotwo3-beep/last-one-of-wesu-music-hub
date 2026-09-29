import { describe, expect, it } from "vitest";
import { batteryGuidance, isKnownBrand } from "@/lib/device-health";

describe("battery guidance per manufacturer", () => {
  it("covers every brand family that dominates the user base", () => {
    expect(batteryGuidance("Xiaomi").family).toBe("Xiaomi");
    expect(batteryGuidance("redmi").family).toBe("Xiaomi");
    expect(batteryGuidance("POCO").family).toBe("Xiaomi");
    expect(batteryGuidance("OPPO").family).toBe("Oppo");
    expect(batteryGuidance("realme").family).toBe("Oppo");
    expect(batteryGuidance("vivo").family).toBe("Vivo");
    expect(batteryGuidance("TECNO").family).toBe("Transsion");
    expect(batteryGuidance("Infinix").family).toBe("Transsion");
    expect(batteryGuidance("itel").family).toBe("Transsion");
    expect(batteryGuidance("samsung").family).toBe("Samsung");
    expect(batteryGuidance("HUAWEI").family).toBe("Huawei");
  });

  it("falls back to plain Android for unknown or missing brands", () => {
    expect(batteryGuidance("").family).toBe("Android");
    expect(batteryGuidance(null).family).toBe("Android");
    expect(batteryGuidance(undefined).family).toBe("Android");
    expect(batteryGuidance("Nokia").family).toBe("Android");
    expect(isKnownBrand("Nokia")).toBe(false);
    expect(isKnownBrand("Infinix")).toBe(true);
  });

  it("always gives at least two actionable steps, never empty", () => {
    for (const brand of ["xiaomi", "oppo", "tecno", "samsung", "", "weird-brand"]) {
      const g = batteryGuidance(brand);
      expect(g.steps.length).toBeGreaterThanOrEqual(2);
      expect(g.family.length).toBeGreaterThan(0);
      for (const step of g.steps) expect(step.trim().length).toBeGreaterThan(10);
    }
  });

  it("mentions autostart on the vendors that need it, not on Samsung", () => {
    expect(batteryGuidance("Infinix").steps.join(" ")).toMatch(/Autostart/i);
    expect(batteryGuidance("OPPO").steps.join(" ")).toMatch(/Autostart/i);
    expect(batteryGuidance("samsung").steps.join(" ")).toMatch(/Never sleeping apps/i);
  });
});
