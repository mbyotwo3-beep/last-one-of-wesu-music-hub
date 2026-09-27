import { describe, expect, it } from "vitest";
import { describeOnlineTransition } from "@/components/OfflineBanner";

describe("offline/online transition edges", () => {
  it("classifies each edge exactly once", () => {
    expect(describeOnlineTransition(true, false)).toBe("went-offline");
    expect(describeOnlineTransition(false, true)).toBe("went-online");
    expect(describeOnlineTransition(true, true)).toBe("none");
    expect(describeOnlineTransition(false, false)).toBe("none");
  });
});
