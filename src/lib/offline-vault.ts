/**
 * Encrypted offline vault.
 *
 * Downloads are NOT saved as playable audio files. Each track is encrypted
 * with AES-GCM under a device-local, non-extractable key and stored as
 * ciphertext in IndexedDB. Playback decrypts into memory and feeds a
 * same-session Blob URL (web) or an app-private temp file (native) — so a
 * downloaded song cannot be opened, copied, or played outside this app.
 *
 * Honest limits (no Widevine/FairPlay license server here): the bytes cross
 * the network once during download, and a rooted/jailbroken device or a
 * debugger can always capture process memory. What this guarantees is that
 * nothing playable is ever written to disk or exposed as a file/URL.
 */

import { noteVaultChanged, setCachedVaultIds } from "@/lib/vault-index";

const DB_NAME = "wesu-offline-vault";
const DB_VERSION = 2;
const TRACKS_STORE = "tracks";
/**
 * Metadata-only mirror of TRACKS_STORE (no ciphertext, no artwork bytes).
 *
 * Listing downloads used to `getAll()` the tracks store, which deserialises
 * every encrypted audio blob into RAM just to read a title. /downloads fired
 * that twice on mount (list + usage), so opening the page with a full vault
 * allocated roughly twice the vault size — up to ~3 GB on a phone. That is the
 * "downloads page won't open" failure. This store is what lists now read.
 */
const META_STORE = "meta";
const DEVICE_STORE = "device";
const DEVICE_KEY_ID = "aes-gcm-256";
/** Hard cap so one device can't fill its disk (bounded offline cache). */
export const MAX_VAULT_BYTES = 1_500_000_000;

/**
 * The signed-in account every vault write is stamped with and every read is
 * filtered by. Device state (the encryption key) is shared; the MUSIC inside
 * is not. Kept in module state — not React — because the player's synchronous
 * index reads must already reflect the right account, and because this module
 * must stay framework-free.
 */
let currentOwnerUserId: string | null = null;

/**
 * Point the vault at an account (null when signed out). The caller — the auth
 * bootstrap — re-runs `refreshVaultIdCache()` right after, so the player's
 * index and every checkmark flip to the new account's set in one step.
 */
export function setVaultOwner(userId: string | null): void {
  currentOwnerUserId = userId ?? null;
}

/** True when a vault row belongs to the currently signed-in account. */
function rowBelongsToCurrentUser(row: { ownerUserId?: string | null }): boolean {
  // Rows saved while signed out (no entitlement flow reaches here today, but
  // be lenient) belong to the device's signed-out state: they show only when
  // nobody is signed in, and never bleed into an account's library.
  return (row.ownerUserId ?? null) === currentOwnerUserId;
}

export interface VaultTrackMeta {
  songId: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  mime: string;
  size: number;
  downloadedAt: number;
  /**
   * Apple-style account scoping: downloads belong to the account that
   * downloaded them, not to the device. Listing, the card checkmark and
   * playback all compare this against the signed-in user, so signing into
   * another account on the same phone never shows (or plays) someone else's
   * music. Rows written before this field existed have no owner at all —
   * ownership cannot be proven for them, so they are purged once (the
   * entitlement they were downloaded under may no longer even exist).
   */
  ownerUserId?: string | null;
  /**
   * Plaintext cover bytes (decorative, not sensitive) fetched at download
   * time so the lock-screen/shade player shows artwork with zero network —
   * Spotify-style offline. Old rows lack it: callers fall back to coverUrl.
   */
  artwork?: ArrayBuffer | null;
}

interface VaultRecord extends VaultTrackMeta {
  iv: number[];
  data: ArrayBuffer;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" && typeof indexedDB !== "undefined" && !!window.crypto?.subtle
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
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "songId" });
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

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
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
let deviceKeyPromise: Promise<CryptoKey> | null = null;

/**
 * Read-then-create is not atomic, so two things could each decide the key was
 * missing: a genuine first run, and a transient IndexedDB read error (the old
 * code caught every error and treated it as "no key exists"). Generating a
 * replacement key there silently invalidated the ENTIRE vault — every download
 * then failed to decrypt with "this download is corrupted". Two first-time
 * downloads racing (the playlist bulk loop does exactly this) had the same
 * effect.
 *
 * Now: a real read failure propagates instead of faking an empty vault, and a
 * single in-flight promise serialises first-run creation.
 */
async function getDeviceKey(): Promise<CryptoKey> {
  if (deviceKeyPromise) return deviceKeyPromise;
  deviceKeyPromise = (async () => {
    let existing: { id: string; key: CryptoKey } | undefined;
    try {
      existing = await tx<{ id: string; key: CryptoKey } | undefined>(
        DEVICE_STORE,
        "readonly",
        (s) => s.get(DEVICE_KEY_ID),
      );
    } catch {
      // Unreachable store or blocked storage. Guessing here would replace the
      // key and corrupt every existing download, so fail loudly instead.
      throw new Error("Offline storage is unavailable on this device");
    }
    if (existing?.key) return existing.key;
    const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    await tx(DEVICE_STORE, "readwrite", (s) => s.put({ id: DEVICE_KEY_ID, key }));
    return key;
  })();
  try {
    return await deviceKeyPromise;
  } catch (err) {
    deviceKeyPromise = null;
    throw err;
  }
}

function randomIv(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(12));
}

/** When this copy was downloaded (ms epoch), or null when unknown. Never decrypts. */
export async function getVaultDownloadedAt(songId: string): Promise<number | null> {
  if (!supported() || !songId) return null;
  try {
    const rec = await tx<{ downloadedAt?: number } | undefined>(TRACKS_STORE, "readonly", (s) =>
      s.get(songId),
    );
    return typeof rec?.downloadedAt === "number" ? rec.downloadedAt : null;
  } catch {
    return null;
  }
}

/**
 * Spotify-style license check: downloads older than maxAgeMs revalidate
 * purchase when the device is online. Unknown age plays (fail-open).
 */
export async function isVaultLicenseStale(songId: string, maxAgeMs: number): Promise<boolean> {
  const at = await getVaultDownloadedAt(songId);
  if (at === null) return false;
  return Date.now() - at > maxAgeMs;
}

export const VAULT_LICENSE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Pure playback decision for a stale vault copy. Offline (or a probe that
 * failed for non-purchase reasons) always plays — offline must work
 * offline. Only a confirmed purchase failure blocks.
 */
export function decideStaleVaultPlayback(args: {
  stale: boolean;
  online: boolean;
  probePurchaseFailed: boolean;
}): "play" | "blocked" {
  if (!args.stale) return "play";
  if (!args.online) return "play";
  return args.probePurchaseFailed ? "blocked" : "play";
}

/**
 * Rebuild the in-memory id set the player reads synchronously.
 *
 * The state lives in vault-index.ts, deliberately outside this module: the player
 * store imports it, and pulling encryption and IndexedDB code into the player
 * would make playback depend on a storage layer that also cannot run during SSR.
 * This function is the vault's only contribution — it is the part that knows how
 * to enumerate storage.
 */
export async function refreshVaultIdCache(): Promise<ReadonlySet<string>> {
  const meta = await listVaultMeta();
  return setCachedVaultIds(meta.map((m) => m.songId));
}

/** List downloaded tracks (metadata only — never decrypts audio). */
export async function listVaultMeta(): Promise<VaultTrackMeta[]> {
  if (!supported()) return [];
  await ensureMetaBackfill();
  try {
    // Read the metadata mirror: no ciphertext is deserialised, so listing a
    // full vault costs kilobytes rather than gigabytes.
    const recs = await tx<VaultTrackMeta[]>(META_STORE, "readonly", (s) => s.getAll());
    return recs
      .filter(rowBelongsToCurrentUser)
      .map((r) => ({
        songId: r.songId,
        title: r.title,
        artistName: r.artistName,
        coverUrl: r.coverUrl,
        mime: r.mime,
        size: r.size ?? 0,
        downloadedAt: r.downloadedAt ?? 0,
        ownerUserId: r.ownerUserId ?? null,
      }))
      .sort((a, b) => b.downloadedAt - a.downloadedAt);
  } catch {
    return [];
  }
}

/**
 * Rows written before the metadata mirror existed have no META entry. Rebuild
 * them once (a full read, but only ever once per device) so upgrading users
 * don't find their downloads page suddenly empty.
 *
 * The same pass purges rows with no `ownerUserId`: they predate account
 * scoping, so the entitlement they were downloaded under can no longer be
 * proven — the account may have been deleted outright. Showing them to
 * whichever account is next signed in would let someone play music this
 * account never bought, so unowned rows are removed rather than claimed.
 * Owners re-download in one tap (their entitlement is intact).
 */
let metaBackfillDone = false;
async function ensureMetaBackfill(): Promise<void> {
  if (metaBackfillDone || !supported()) return;
  try {
    const ids = (await tx<IDBValidKey[]>(TRACKS_STORE, "readonly", (s) =>
      s.getAllKeys(),
    )) as string[];
    if (!ids.length) {
      metaBackfillDone = true;
      return;
    }
    const known = new Set(
      (await tx<IDBValidKey[]>(META_STORE, "readonly", (s) => s.getAllKeys())).map(String),
    );
    const missing = ids.filter((id) => !known.has(String(id)));
    for (const id of missing) {
      const rec = await tx<VaultRecord | undefined>(TRACKS_STORE, "readonly", (s) => s.get(id));
      if (!rec) continue;
      await tx(META_STORE, "readwrite", (s) =>
        s.put({
          songId: rec.songId,
          title: rec.title,
          artistName: rec.artistName,
          coverUrl: rec.coverUrl,
          mime: rec.mime,
          size: rec.size ?? 0,
          downloadedAt: rec.downloadedAt ?? 0,
          ownerUserId: rec.ownerUserId ?? null,
        }),
      );
    }
    // Purge unownable rows (see the doc comment above). Checked on the meta
    // mirror — cheap — and both stores are cleaned so no ciphertext is left
    // stranded on disk.
    const metaRows = await tx<VaultTrackMeta[]>(META_STORE, "readonly", (s) => s.getAll());
    const unowned = metaRows
      .filter((r) => r.ownerUserId === undefined || r.ownerUserId === null)
      .map((r) => r.songId);
    for (const id of unowned) {
      await tx(TRACKS_STORE, "readwrite", (s) => s.delete(id));
      await tx(META_STORE, "readwrite", (s) => s.delete(id));
      noteVaultChanged(id, false);
    }
    if (unowned.length) {
      try {
        console.info(
          `[offline-vault] removed ${unowned.length} download(s) with no account owner (pre-account-scoping rows)`,
        );
      } catch {
        /* console may be absent in some hosts */
      }
    }
    metaBackfillDone = true;
  } catch {
    /* leave the flag false so a later attempt can retry */
  }
}

// Session cover-art object URLs (plaintext art, never persisted as files).
const vaultArtUrlCache = new Map<string, string>();

function revokeVaultArtUrl(songId: string) {
  const url = vaultArtUrlCache.get(songId);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    vaultArtUrlCache.delete(songId);
  }
}

/**
 * Cover bytes for a download WITHOUT decrypting audio (cheap metadata read).
 * Powers offline artwork in lists and the shade player.
 */
export async function getVaultArtwork(songId: string): Promise<ArrayBuffer | null> {
  if (!supported() || !songId) return null;
  try {
    const rec = await tx<VaultRecord | undefined>(TRACKS_STORE, "readonly", (s) => s.get(songId));
    if (!rec || !rowBelongsToCurrentUser(rec)) return null;
    const art = rec?.artwork;
    if (!art || !(art instanceof ArrayBuffer) || art.byteLength === 0) return null;
    return art;
  } catch {
    return null;
  }
}

/**
 * Same-tab object URL for vault cover art (cached per session). Falls back
 * to null so callers render the regular cover component instead.
 */
export async function getVaultArtObjectUrl(songId: string): Promise<string | null> {
  const cached = vaultArtUrlCache.get(songId);
  if (cached) return cached;
  const art = await getVaultArtwork(songId);
  if (!art) return null;
  try {
    const url = URL.createObjectURL(new Blob([art], { type: "image/jpeg" }));
    vaultArtUrlCache.set(songId, url);
    return url;
  } catch {
    return null;
  }
}

/** Cheap existence probe — reads the mirror, never the audio bytes. */
export async function isTrackDownloaded(songId: string): Promise<boolean> {
  if (!supported() || !songId) return false;
  try {
    // Owner-aware: the checkmark means "downloaded by THIS account". The meta
    // mirror read costs kilobytes; reading TRACKS keys alone cannot tell who
    // owns the row.
    const rec = await tx<VaultTrackMeta | undefined>(META_STORE, "readonly", (s) => s.get(songId));
    return !!rec && rowBelongsToCurrentUser(rec);
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
  await ensureMetaBackfill();
  try {
    // Same reason as listVaultMeta: sum sizes from the mirror, never touch the
    // audio blobs.
    const recs = await tx<VaultTrackMeta[]>(META_STORE, "readonly", (s) => s.getAll());
    return {
      trackCount: recs.length,
      bytes: recs.reduce((sum, r) => sum + (r.size || 0), 0),
    };
  } catch {
    return { trackCount: 0, bytes: 0 };
  }
}

/**
 * How much room a new download needs before auto-eviction kicks in.
 *
 * Spotify frees unused stored data to make space and only falls back to asking
 * the listener to remove something themselves when nothing can be freed. We used
 * to do neither: a full vault simply threw, so a listener who downloaded a
 * 1.5 GB library hit a dead end and could not add anything without manually
 * deleting tracks one by one.
 *
 * This is the pure decision, kept separate so it is testable: it says WHICH
 * tracks to drop, in what order, never touching the one being downloaded.
 */
export function planEviction(
  candidates: { songId: string; size: number; downloadedAt: number }[],
  needBytes: number,
  freeBytes: number,
): string[] {
  if (needBytes <= freeBytes) return [];
  // Oldest first: least recently downloaded goes first, which is also what a
  // listener would choose if asked.
  const ordered = [...candidates].sort((a, b) => a.downloadedAt - b.downloadedAt);
  const evict: string[] = [];
  let freed = 0;
  for (const c of ordered) {
    if (freed + freeBytes >= needBytes) break;
    evict.push(c.songId);
    freed += Math.max(0, c.size || 0);
  }
  // Every candidate, even when removing all of them still will not be enough.
  // The caller deletes what it can and then reports the shortfall, so returning
  // a partial list here would just leave tracks behind that nothing else frees.
  //
  // (An earlier version ended in `return freed + freeBytes >= needBytes ? evict :
  // evict` — both branches identical, which reads like unfinished intent. The
  // behaviour above is the intent; the dead ternary is gone.)
  return evict;
}

/**
 * Make room, freeing the oldest downloads if necessary.
 * Returns the ids it removed so the UI can say what happened.
 */
async function makeRoomFor(bytesNeeded: number, protectSongId?: string): Promise<string[]> {
  const meta = await listVaultMeta();
  const evictable = meta.filter((m) => m.songId !== protectSongId);
  const { bytes } = await getVaultUsage();

  // Two different budgets, and conflating them is the bug this guards against:
  //
  //   `limit` is a DEVICE limit (what the OS says this app may occupy).
  //   `free` must be measured against the VAULT's size, because that is the only
  //   thing eviction can shrink. Using navigator.storage.estimate().usage here
  //   would mix in every other cache and file, so the computed free space would
  //   be wrong by however much else the WebView is holding — and the app would
  //   evict a listener's downloads unnecessarily, or fail to evict when it must.
  let need = bytesNeeded;
  let limit = MAX_VAULT_BYTES;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (est.quota) limit = Math.min(limit, Math.floor(est.quota * 0.9));
    }
  } catch {
    /* estimate() unsupported — fall back to the hard cap */
  }
  if (limit < bytesNeeded) {
    // The device cap is smaller than the download itself. Nothing to evict;
    // assertQuotaFor will report it.
    need = bytesNeeded;
  }

  const free = Math.max(0, limit - bytes);
  const victims = planEviction(
    evictable.map((m) => ({ songId: m.songId, size: m.size ?? 0, downloadedAt: m.downloadedAt })),
    need,
    free,
  );

  // Only report what was ACTUALLY deleted. Returning the whole plan would have
  // the UI say "removed 3 downloads" when one delete failed, and the listener
  // would find a track still sitting there.
  const removed: string[] = [];
  for (const id of victims) {
    try {
      await removeTrackFromVault(id);
      removed.push(id);
    } catch {
      /* keep going: one undeletable track must not block the rest */
    }
  }
  return removed;
}

async function assertQuotaFor(bytesNeeded: number, protectSongId?: string): Promise<void> {
  // Free space first, exactly as Spotify does, and only complain if that was
  // not enough.
  const evicted = await makeRoomFor(bytesNeeded, protectSongId);
  if (evicted.length) {
    try {
      console.info(
        `[offline-vault] freed space for a new download by removing ${evicted.length} older download(s)`,
      );
    } catch {
      /* console may be absent in some hosts */
    }
  }

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
  // Protect the track being saved: eviction must never delete the thing the
  // listener just asked for, even if it is the oldest entry (a re-download).
  await assertQuotaFor(plaintext.byteLength, meta.songId);
  const key = await getDeviceKey();
  const iv = randomIv();
  let ciphertext: ArrayBuffer;
  try {
    ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer> },
      key,
      plaintext,
    );
  } catch {
    throw new Error("Could not secure this download on your device");
  }
  const record: VaultRecord = {
    songId: meta.songId,
    title: meta.title,
    artistName: meta.artistName,
    coverUrl: meta.coverUrl,
    mime: meta.mime,
    size: plaintext.byteLength + (meta.artwork?.byteLength ?? 0),
    downloadedAt: Date.now(),
    // Account scoping: this download belongs to whoever is signed in at the
    // moment of download. Every later read (listing, checkmark, playback)
    // compares against the then-signed-in account.
    ownerUserId: meta.ownerUserId ?? currentOwnerUserId,
    iv: Array.from(iv),
    data: ciphertext,
    artwork: meta.artwork ?? null,
  };
  // Strip the ciphertext and artwork for the metadata mirror, which is what
  // lists read so that /downloads never deserialises gigabytes of audio.
  //
  // Named `metaRow`, not `meta`: this used to shadow the `meta` parameter, so
  // the `revokeOfflineObjectUrl(meta.songId)` below was reading the destructured
  // row rather than its argument. It worked by luck (both carry songId) and
  // would have broken silently the moment the two shapes diverged.
  const { data: _ciphertext, artwork: _artwork, ...metaRow } = record;
  void _ciphertext;
  void _artwork;

  try {
    await tx(TRACKS_STORE, "readwrite", (s) => s.put(record));
    await tx(META_STORE, "readwrite", (s) => s.put(metaRow));
    // The player reads the id set synchronously; keep it correct on save too.
    noteVaultChanged(record.songId, true);
  } catch (err: any) {
    if (err?.name === "QuotaExceededError") {
      throw new Error("Not enough device storage for this download");
    }
    throw new Error("Could not save this download");
  }
  revokeOfflineObjectUrl(record.songId);
  const { songId, title, artistName, coverUrl, mime, size, downloadedAt, artwork, ownerUserId } =
    record;
  return { songId, title, artistName, coverUrl, mime, size, downloadedAt, artwork, ownerUserId };
}

export async function removeTrackFromVault(songId: string): Promise<void> {
  revokeOfflineObjectUrl(songId);
  revokeVaultArtUrl(songId);
  if (!supported() || !songId) return;
  // Deliberately NOT swallowing: callers toast "Removed from this device"
  // unconditionally and their error branches were unreachable, so a failed
  // delete was reported as success and the song reappeared after a reload.
  try {
    await tx(TRACKS_STORE, "readwrite", (s) => s.delete(songId));
    await tx(META_STORE, "readwrite", (s) => s.delete(songId));
    noteVaultChanged(songId, false);
  } catch {
    throw new Error("Could not remove this download. Try again.");
  }
}

export interface VaultDownloadMeta {
  songId: string;
  title?: string;
  artistName?: string;
  coverUrl?: string | null;
}

/**
 * Download one entitled song straight into the encrypted vault (shared by
 * the per-track button and whole-playlist bulk download). The `fetchSigned`
 * callback must return the server-minted download URL + filename — the
 * server enforces purchase/free/staff entitlement, so unbought paid tracks
 * fail here and callers can count them as skipped.
 */
export async function downloadSongToVault(
  fetchSigned: (songId: string) => Promise<{ url: string; filename: string }>,
  meta: VaultDownloadMeta,
  onProgress?: (pct: number, bytesReceived?: number) => void,
): Promise<void> {
  const { url } = await fetchSigned(meta.songId);
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status})`);
  }
  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastHeartbeat = 0;
  onProgress?.(0, 0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0) {
        onProgress?.(Math.min(99, Math.round((received / total) * 100)), received);
      } else if (received - lastHeartbeat > 524288) {
        // No content-length (chunked): heartbeat byte counts so the UI
        // shows progress instead of sticking on "Preparing…".
        lastHeartbeat = received;
        onProgress?.(0, received);
      }
    }
  }
  const mime = response.headers.get("content-type") || "audio/mpeg";
  const buf = await new Blob(chunks as BlobPart[], { type: mime }).arrayBuffer();
  // Cover bytes for offline shade art (best-effort — never fail the music
  // for a picture). Resolved the same way <StorageImage> does.
  let artwork: ArrayBuffer | null = null;
  if (meta.coverUrl) {
    try {
      const { resolveImageUrl } = await import("./storage-url");
      const artUrl = await resolveImageUrl("album-art", meta.coverUrl);
      if (artUrl) {
        const artRes = await fetch(artUrl, { credentials: "omit" });
        if (artRes.ok) {
          const artBuf = await artRes.arrayBuffer();
          if (artBuf.byteLength > 0 && artBuf.byteLength <= 2 * 1024 * 1024) {
            artwork = artBuf;
          }
        }
      }
    } catch {
      /* offline art unavailable — playback unaffected */
    }
  }
  await saveTrackToVault(
    {
      songId: meta.songId,
      title: meta.title ?? "Unknown title",
      artistName: meta.artistName ?? "Unknown artist",
      coverUrl: meta.coverUrl ?? null,
      mime,
      artwork,
    },
    buf,
  );
  onProgress?.(100);
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
  // Account scoping, enforced at the decrypt boundary too: another account's
  // download on this device is treated as not downloaded — the player's index
  // already filters, this closes any path that skips it.
  if (!rowBelongsToCurrentUser(rec)) return null;
  const key = await getDeviceKey();
  try {
    const bytes = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(rec.iv) },
      key,
      rec.data,
    );
    const {
      songId: id,
      title,
      artistName,
      coverUrl,
      mime,
      size,
      downloadedAt,
      ownerUserId,
    } = rec;
    return {
      bytes,
      mime,
      meta: {
        songId: id,
        title,
        artistName,
        coverUrl,
        mime,
        size,
        downloadedAt,
        artwork: rec.artwork ?? null,
        ownerUserId: ownerUserId ?? null,
      },
    };
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
