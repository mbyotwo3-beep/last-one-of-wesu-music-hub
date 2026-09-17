/**
 * Spotify-style encrypted offline vault.
 *
 * Downloads are NOT saved as playable audio files. Each track is encrypted
 * with AES-GCM under a device-local, non-extractable key and stored as
 * ciphertext in IndexedDB. Playback decrypts into memory and feeds a
 * same-session Blob URL (web) or an app-private temp file (native) — so a
 * downloaded song cannot be opened, copied, or played outside this app,
 * exactly like Spotify/YouTube offline content.
 *
 * Honest limits (no Widevine/FairPlay license server here): the bytes cross
 * the network once during download, and a rooted/jailbroken device or a
 * debugger can always capture process memory. What this guarantees is that
 * nothing playable is ever written to disk or exposed as a file/URL.
 */

const DB_NAME = "wesu-offline-vault";
const DB_VERSION = 1;
const TRACKS_STORE = "tracks";
const DEVICE_STORE = "device";
const DEVICE_KEY_ID = "aes-gcm-256";
/** Hard cap so one device can't fill its disk (Spotify-style bounded cache). */
export const MAX_VAULT_BYTES = 1_500_000_000;

export interface VaultTrackMeta {
  songId: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  mime: string;
  size: number;
  downloadedAt: number;
}

interface VaultRecord extends VaultTrackMeta {
  iv: number[];
  data: ArrayBuffer;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    !!window.crypto?.subtle
  );
}

export function isVaultSupported(): boolean {
  return supported();
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!supported()) return Promise.reject(new Error("Offline downloads are not supported here"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TRACKS_STORE)) {
          db.createObjectStore(TRACKS_STORE, { keyPath: "songId" });
        }
        if (!db.objectStoreNames.contains(DEVICE_STORE)) {
          db.createObjectStore(DEVICE_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error("Could not open offline vault"));
      };
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Vault transaction failed"));
      }),
  );
}

/**
 * The device key is generated once and stored non-extractable: page JS can
 * USE it for encrypt/decrypt but can never read the raw key bytes out, and
 * the ciphertext in IndexedDB is useless on any other device or app.
 */
async function getDeviceKey(): Promise<CryptoKey> {
  const existing = await tx<{ id: string; key: CryptoKey } | undefined>(
    DEVICE_STORE,
    "readonly",
    (s) => s.get(DEVICE_KEY_ID),
  ).catch(() => undefined);
  if (existing?.key) return existing.key;
  const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await tx(DEVICE_STORE, "readwrite", (s) => s.put({ id: DEVICE_KEY_ID, key }));
  return key;
}

function randomIv(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(12));
}

/** Cheap existence probe — reads the key only, never the audio bytes. */
export async function isTrackDownloaded(songId: string): Promise<boolean> {
  if (!supported() || !songId) return false;
  try {
    const key = await tx<unknown>(TRACKS_STORE, "readonly", (s) => s.getKey(songId));
    return key != null;
  } catch {
    return false;
  }
}

export async function getVaultTrackIds(): Promise<string[]> {
  if (!supported()) return [];
  try {
    const keys = await tx<IDBValidKey[]>(TRACKS_STORE, "readonly", (s) => s.getAllKeys());
    return (keys as string[]).filter(Boolean);
  } catch {
    return [];
  }
}

export async function getVaultUsage(): Promise<{ trackCount: number; bytes: number }> {
  if (!supported()) return { trackCount: 0, bytes: 0 };
  try {
    const recs = await tx<VaultRecord[]>(TRACKS_STORE, "readonly", (s) => s.getAll());
    return {
      trackCount: recs.length,
      bytes: recs.reduce((sum, r) => sum + (r.size || 0), 0),
    };
  } catch {
    return { trackCount: 0, bytes: 0 };
  }
}

async function assertQuotaFor(bytesNeeded: number): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const quota = est.quota ?? MAX_VAULT_BYTES;
      const usage = est.usage ?? 0;
      if (usage + bytesNeeded > Math.min(quota * 0.9, Number.MAX_SAFE_INTEGER)) {
        throw new Error("Not enough device storage for this download");
      }
    }
    const { bytes } = await getVaultUsage();
    if (bytes + bytesNeeded > MAX_VAULT_BYTES) {
      throw new Error("Offline storage is full (1.5 GB limit) — remove a download first");
    }
  } catch (err) {
    if (err instanceof Error && /storage|quota|full/i.test(err.message)) throw err;
    // estimate() unsupported — proceed and let the put() surface real errors.
  }
}

/**
 * Encrypt + store one entitled track. Overwrites any previous copy.
 * Throws user-friendly errors on quota exhaustion.
 */
export async function saveTrackToVault(
  meta: Omit<VaultTrackMeta, "size" | "downloadedAt">,
  plaintext: ArrayBuffer,
): Promise<VaultTrackMeta> {
  if (!supported()) throw new Error("Offline downloads are not supported here");
  if (!plaintext || plaintext.byteLength === 0) throw new Error("Nothing to save");
  await assertQuotaFor(plaintext.byteLength);
  const key = await getDeviceKey();
  const iv = randomIv();
  let ciphertext: ArrayBuffer;
  try {
    ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer> }, key, plaintext);
  } catch {
    throw new Error("Could not secure this download on your device");
  }
  const record: VaultRecord = {
    songId: meta.songId,
    title: meta.title,
    artistName: meta.artistName,
    coverUrl: meta.coverUrl,
    mime: meta.mime,
    size: plaintext.byteLength,
    downloadedAt: Date.now(),
    iv: Array.from(iv),
    data: ciphertext,
  };
  try {
    await tx(TRACKS_STORE, "readwrite", (s) => s.put(record));
  } catch (err: any) {
    if (err?.name === "QuotaExceededError") {
      throw new Error("Not enough device storage for this download");
    }
    throw new Error("Could not save this download");
  }
  revokeOfflineObjectUrl(meta.songId);
  const { songId, title, artistName, coverUrl, mime, size, downloadedAt } = record;
  return { songId, title, artistName, coverUrl, mime, size, downloadedAt };
}

export async function removeTrackFromVault(songId: string): Promise<void> {
  revokeOfflineObjectUrl(songId);
  if (!supported() || !songId) return;
  try {
    await tx(TRACKS_STORE, "readwrite", (s) => s.delete(songId));
  } catch {
    /* best effort */
  }
}

/** Decrypt one track into memory. Returns null when not downloaded. */
export async function readVaultTrack(
  songId: string,
): Promise<{ bytes: ArrayBuffer; mime: string; meta: VaultTrackMeta } | null> {
  if (!supported() || !songId) return null;
  const rec = await tx<VaultRecord | undefined>(TRACKS_STORE, "readonly", (s) =>
    s.get(songId),
  ).catch(() => undefined);
  if (!rec) return null;
  const key = await getDeviceKey();
  try {
    const bytes = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(rec.iv) },
      key,
      rec.data,
    );
    const { songId: id, title, artistName, coverUrl, mime, size, downloadedAt } = rec;
    return { bytes, mime, meta: { songId: id, title, artistName, coverUrl, mime, size, downloadedAt } };
  } catch {
    throw new Error("This download is corrupted — remove it and download again");
  }
}

// Session Blob-URL cache: decrypted bytes become a same-tab object URL that
// dies with the tab. Never persisted, never shared.
const blobUrlCache = new Map<string, string>();

export function revokeOfflineObjectUrl(songId: string): void {
  const url = blobUrlCache.get(songId);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    blobUrlCache.delete(songId);
  }
}

/** Decrypt (once per session) and hand out a playable same-tab object URL. */
export async function getOfflineObjectUrl(songId: string): Promise<string | null> {
  const cached = blobUrlCache.get(songId);
  if (cached) return cached;
  const track = await readVaultTrack(songId);
  if (!track) return null;
  const url = URL.createObjectURL(new Blob([track.bytes], { type: track.mime || "audio/mpeg" }));
  blobUrlCache.set(songId, url);
  return url;
}
