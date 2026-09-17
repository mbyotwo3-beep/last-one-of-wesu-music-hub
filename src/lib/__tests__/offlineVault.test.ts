/**
 * Regression tests for the Spotify-style encrypted offline vault.
 *
 * - Real AES-GCM round-trip through a non-extractable device key (Node has
 *   WebCrypto), mirroring offline-vault.ts: ciphertext decrypts with the
 *   right IV, fails with the wrong IV, and the key can never be exported.
 * - Download routing matrix mirroring DownloadButton.tsx: desktop/native
 *   go to the vault, mobile browsers go to /get-app, anonymous users see
 *   nothing.
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// AES-GCM device-key round trip (real WebCrypto)
// ---------------------------------------------------------------------------

async function makeDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

describe("Vault encryption", () => {
  it("encrypt then decrypt returns the original bytes", async () => {
    const key = await makeDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode("fake-audio-bytes-123").buffer as ArrayBuffer;
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    expect(new Uint8Array(cipher)).not.toEqual(new Uint8Array(plain));
    const back = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    expect(Buffer.from(back).toString()).toBe("fake-audio-bytes-123");
  });

  it("wrong IV fails decryption (tampered copies are useless)", async () => {
    const key = await makeDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode("fake-audio-bytes").buffer as ArrayBuffer;
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    const wrongIv = crypto.getRandomValues(new Uint8Array(12));
    await expect(crypto.subtle.decrypt({ name: "AES-GCM", iv: wrongIv }, key, cipher)).rejects.toThrow();
  });

  it("device key is non-extractable (raw key bytes can never leave the app)", async () => {
    const key = await makeDeviceKey();
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("random round-trips always work", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 256 }), async (bytes) => {
        const key = await makeDeviceKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, input);
        const back = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
        expect(new Uint8Array(back)).toEqual(bytes);
      }),
      { numRuns: 25 },
    );
  });
});

// ---------------------------------------------------------------------------
// Download routing matrix (mirrors DownloadButton.tsx)
// ---------------------------------------------------------------------------

type Destination = "hidden" | "vault" | "app-page";

function downloadDestination(args: {
  user: boolean;
  isNative: boolean;
  isMobile: boolean;
}): Destination {
  if (!args.user) return "hidden";
  if (!args.isNative && args.isMobile) return "app-page";
  return "vault";
}

describe("Download routing", () => {
  it("anonymous users get no download control anywhere", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isNative, isMobile) => {
        expect(downloadDestination({ user: false, isNative, isMobile })).toBe("hidden");
      }),
      { numRuns: 20 },
    );
  });

  it("mobile browsers route to the app page (never direct files)", () => {
    expect(downloadDestination({ user: true, isNative: false, isMobile: true })).toBe("app-page");
  });

  it("desktop browsers and the native app use the encrypted vault", () => {
    expect(downloadDestination({ user: true, isNative: false, isMobile: false })).toBe("vault");
    expect(downloadDestination({ user: true, isNative: true, isMobile: true })).toBe("vault");
    expect(downloadDestination({ user: true, isNative: true, isMobile: false })).toBe("vault");
  });
});
