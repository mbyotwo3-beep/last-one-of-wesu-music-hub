import { describe, expect, it } from "vitest";
import { mapDownloadError } from "@/components/DownloadButton";

/**
 * A full phone is the single most common download failure on the low-end
 * devices this app targets, and the browser reports it as a raw DOM
 * exception. These lock that the listener only ever sees plain language and
 * never a raw message.
 */
describe("download error messages", () => {
  it("says storage is full rather than showing the DOM exception", () => {
    const raw = new Error(
      "QuotaExceededError: Failed to execute 'setItem' on 'IDBObjectStore': The quota has been exceeded.",
    );
    const out = mapDownloadError(raw, true);
    expect(out).toMatch(/not enough space/i);
    expect(out).not.toMatch(/quota|setItem|IDBObjectStore/i);
  });

  it("catches the other ways a full disk is reported", () => {
    for (const m of [
      "ENOSPC: no space left on device",
      "storage is full",
      "exceeded the storage quota",
    ]) {
      expect(mapDownloadError(new Error(m), true)).toMatch(/not enough space/i);
    }
  });

  it("keeps the offline and purchase messages intact", () => {
    expect(mapDownloadError(new Error("x"), false)).toMatch(/offline/i);
    expect(mapDownloadError(new Error("403 payment required"), true)).toMatch(/after purchase/i);
  });

  it("explains a network drop and a stale download", () => {
    expect(mapDownloadError(new Error("fetch failed"), true)).toMatch(/connection/i);
    expect(mapDownloadError(new Error("vault key rejected"), true)).toMatch(/re-verifying/i);
  });

  it("still passes a plain server error through, so real signal survives", () => {
    // No URL or signed token is minted on this path, so a specific status is
    // more useful than a generic "try again".
    expect(mapDownloadError(new Error("Download failed (500)"), true)).toBe(
      "Download failed (500)",
    );
  });
});
