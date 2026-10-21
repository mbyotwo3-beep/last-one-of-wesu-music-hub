import { describe, expect, it } from "vitest";
import {
  describeOfflineChip,
  isUnavailableOffline,
  mustFilterQueue,
  type OfflineInputs,
  type OfflineState,
} from "@/lib/offline-availability";

const device: OfflineState = { online: true, modeOn: false, vaultReady: true };
const base: OfflineInputs = { ...device, downloaded: false };

describe("offline is one rule, used by both the UI and the player", () => {
  // These two states used to be treated differently by the two call sites. The
  // UI called a dropped connection "offline"; the player filtered the queue only
  // under the listener's mode. So a shelf could look correctly dimmed and still
  // hand the player tracks it had no way to fetch, and the shelf simply would
  // not play with nothing logged.
  //
  // These are questions about the DEVICE — `downloaded` is deliberately not a
  // parameter, because "is this track on the phone" is a different function.
  const deviceCases: Array<[string, OfflineState, boolean]> = [
    ["online, mode off — unfiltered", device, false],
    ["MODE on with a working connection — filtered", { ...device, modeOn: true }, true],
    ["NO CONNECTION with mode off — filtered", { ...device, online: false }, true],
    ["NO CONNECTION and mode on — filtered", { ...device, online: false, modeOn: true }, true],
  ];

  for (const [name, state, expected] of deviceCases) {
    it(name, () => {
      expect(mustFilterQueue(state)).toBe(expected);
    });
  }

  // The per-track question. This is the one the UI asks per card, and it is
  // where "downloaded" belongs.
  const trackCases: Array<[string, OfflineInputs, boolean]> = [
    ["online, mode off — plays", base, false],
    ["online, mode off, downloaded — plays", { ...base, downloaded: true }, false],
    ["MODE on, not downloaded — unavailable", { ...base, modeOn: true }, true],
    ["MODE on, downloaded — plays", { ...base, modeOn: true, downloaded: true }, false],
    ["NO CONNECTION, not downloaded — unavailable", { ...base, online: false }, true],
    ["NO CONNECTION, downloaded — plays", { ...base, online: false, downloaded: true }, false],
  ];

  for (const [name, inputs, expected] of trackCases) {
    it(name, () => {
      expect(isUnavailableOffline(inputs)).toBe(expected);
    });
  }

  // Without this the queue is emptied for every listener the instant they open
  // the app with no data, because "index not read yet" and "nothing downloaded"
  // are both an empty set. Only the option that produces silence instead of a
  // wrong-but-recoverable queue.
  it("does not filter before the vault has been read once", () => {
    expect(mustFilterQueue({ ...base, vaultReady: false, modeOn: true })).toBe(false);
    expect(mustFilterQueue({ ...base, vaultReady: false, online: false })).toBe(false);
  });

  it("never treats an unread vault as empty in either direction", () => {
    // The UI must not grey the whole catalogue on a cold start...
    expect(isUnavailableOffline({ ...base, vaultReady: false, modeOn: true })).toBe(false);
    // ...and the player must not empty the queue in the same instant.
    expect(mustFilterQueue({ ...base, vaultReady: false, modeOn: true })).toBe(false);
  });

  it("dims exactly the items the player would refuse", () => {
    // The visual and the behaviour must agree. If one greys a track and the
    // other still plays it, or the reverse, the listener sees an interface that
    // lies about the device they are holding. The player's queue is filtered
    // track by track by `planOfflineQueue`, so what lands in the queue is
    // exactly the set the UI leaves bright.
    const rows: OfflineInputs[] = trackCases.map(([, inputs]) => inputs);
    for (const inputs of rows) {
      // Filtering is active for this device...
      const filtering = mustFilterQueue(inputs);
      // ...and a track survives it exactly when the UI does not dim it.
      const survivesFilter = filtering ? inputs.downloaded : true;
      expect(!isUnavailableOffline(inputs)).toBe(survivesFilter);
    }
  });
});

describe("the chip appears only when the network is gone", () => {
  // There is exactly one offline state since the manual switch was retired —
  // the connection itself. Online means no pill at all, and no leftover flag
  // can conjure one: a pill saying otherwise would lie about the network.
  it("says nothing while online — even with a leftover mode flag", () => {
    expect(describeOfflineChip(true, false)).toBeNull();
    expect(describeOfflineChip(true, true)).toBeNull();
  });

  it("says You're offline and offers the one useful destination", () => {
    expect(describeOfflineChip(false, false)).toMatchObject({
      label: "You're offline",
      action: "downloads",
      tone: "amber",
    });
    expect(describeOfflineChip(false, true)?.action).toBe("downloads");
  });

  it("never offers a Turn off button — nothing was switched on", () => {
    expect(describeOfflineChip(false, false)?.action).not.toBe("turn-off");
  });
});