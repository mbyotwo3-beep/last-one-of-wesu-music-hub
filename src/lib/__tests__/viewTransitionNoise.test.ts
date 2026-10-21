/**
 * The View Transition skip is the ONLY thing this filter may swallow.
 *
 * Real-world failure this pins: the suppressor is written once and then never
 * looked at again — if it ever widened (a different DOMException, or a prefix
 * drift on Chromium 153+'s suffixed messages), offline diagnostics like "1
 * thing(s) not ready" or player failures could start vanish from the console
 * and the app would look broken in screenshots nobody took. So the classifier
 * is pure and asserted against both its expected skips AND its expected
 * false-negatives for anything that merely resembles it.
 */
import { describe, expect, it } from "vitest";

import { isBenignViewTransitionSkip } from "@/lib/view-transition-noise";

const domLike = (name: string, message: string) => {
  const e = new Error(message);
  e.name = name;
  return e;
};

describe("isBenignViewTransitionSkip", () => {
  it("accepts the plain Chromium phrase", () => {
    expect(
      isBenignViewTransitionSkip(domLike("InvalidStateError", "Transition was aborted because of invalid state")),
    ).toBe(true);
  });

  it("accepts Chromium 153+ suffixed messages (prefix match, like react#37669 wants)", () => {
    expect(
      isBenignViewTransitionSkip(
        domLike("InvalidStateError", "Transition was aborted because of invalid state. Document hidden"),
      ),
    ).toBe(true);
    expect(
      isBenignViewTransitionSkip(
        domLike(
          "InvalidStateError",
          "Transition was aborted because of invalid state. Old view transition aborted by new view transition",
        ),
      ),
    ).toBe(true);
  });

  it("rejects every other InvalidStateError — the name alone is not enough", () => {
    // The audio engine, the vault and CSS scroll APIs all raise InvalidStateError
    // too; swallowing those would hide real bugs just because the name matches.
    expect(isBenignViewTransitionSkip(domLike("InvalidStateError", "value must be finite"))).toBe(false);
    expect(isBenignViewTransitionSkip(domLike("InvalidStateError", ""))).toBe(false);
  });

  it("rejects other errors with a similar message", () => {
    expect(
      isBenignViewTransitionSkip(domLike("AbortError", "Transition was aborted because of invalid state")),
    ).toBe(false);
    expect(
      isBenignViewTransitionSkip(domLike("DOMException", "Transition was aborted because of invalid state")),
    ).toBe(false);
  });

  it("rejects everything that is not an Error-shaped reason at all", () => {
    expect(isBenignViewTransitionSkip("Transition was aborted because of invalid state")).toBe(false);
    expect(isBenignViewTransitionSkip({ name: "InvalidStateError", message: null })).toBe(false);
    expect(isBenignViewTransitionSkip(undefined)).toBe(false);
    expect(isBenignViewTransitionSkip(null)).toBe(false);
    expect(isBenignViewTransitionSkip(42)).toBe(false);
  });
});
