import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Offline list snapshots (Spotify-style browsable cache).
 *
 * Server list data is snapshotted to localStorage on every success (small
 * JSON only — playable bytes live in the encrypted vault, covers come from
 * HTTP cache or placeholders). When a query fails while the device reports
 * offline, the last snapshot renders instead of an error/empty state, and
 * playback stays gated by entitlement as usual (only downloads play).
 *
 * Pure helpers (save/load) are unit-tested; the hook itself is thin.
 */

const PREFIX = "wesu:snap:";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const MAX_BYTES = 400_000;

export function readOnlineStatus(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * Subscribes to connectivity. `readOnlineStatus()` was called during render with
 * no listener, so `online` froze at mount value: losing signal mid-session left
 * the snapshot branch unevaluated until some unrelated re-render — the "the
 * list vanished when I went offline" symptom this hook exists to prevent.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(readOnlineStatus);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(readOnlineStatus());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * Namespace a snapshot by account.
 *
 * The storage key used to be the caller's constant string, e.g.
 * "library:my-playlists". Two people using the same phone shared it: sign in as
 * A, go offline, sign out, sign in as B, go offline — and B's Library rendered
 * A's playlists, names and tracklists. Nothing about that is public data, so
 * the fix is to scope the key.
 *
 * The scope is derived from the React Query key, which already carries
 * `user?.id` for user-scoped lists. Public lists like ["new-releases"] have no
 * user id, so they keep one shared snapshot — which is correct, they are the
 * same for everyone.
 */
export function snapshotStorageKey(key: string, scope?: string): string {
  return scope ? `${PREFIX}${scope}:${key}` : `${PREFIX}${key}`;
}

export function saveSnapshot(key: string, data: unknown, scope?: string): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const raw = JSON.stringify({ at: Date.now(), data });
    if (raw.length > MAX_BYTES) {
      // Best-effort by design: a previous snapshot of this same scope is left
      // in place rather than deleted, so offline browsing degrades to stale
      // instead of to empty. It was entirely silent before, so "offline just
      // quietly stopped working" was undiagnosable from the outside.
      console.warn(
        `[offline-list] snapshot "${key}" is ${raw.length} bytes, over the ${MAX_BYTES} limit — keeping the previous snapshot instead of writing this one.`,
      );
      return;
    }
    window.localStorage.setItem(snapshotStorageKey(key, scope), raw);
  } catch {
    /* quota / private mode — caching is best-effort */
  }
}

export function loadSnapshot<T>(key: string, scope?: string): T | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(snapshotStorageKey(key, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown; data?: T };
    if (!parsed || typeof parsed.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) {
      return null;
    }
    return (parsed.data ?? null) as T | null;
  } catch {
    return null;
  }
}

/**
 * Central shape guard for everything flowing through useOfflineList. Every
 * list page's data crosses this one function — live query results, loader
 * seeds and offline snapshots alike.
 *
 * Why it exists: the same page family kept crashing with
 * "x.map is not a function" (home XVFLAL, library 4Y9EFV, browse 1UZXQ1,
 * /new-music) because a server-fn response consumed through the app shell
 * occasionally arrives as a corrupted non-array envelope (a string, an empty
 * object). One normalized boundary degrades all of them to "no data" so the
 * page renders an empty section / falls back to its offline snapshot, and the
 * warn names the offending storage key so a device report pinpoints the
 * source instead of a blind guard.
 *
 * Only strings / numbers / booleans / (for list keys) non-arrays are treated
 * as corrupt. Legit payloads pass through untouched, so this cannot destroy
 * real content.
 */
export function normalizeListData<T>(
  value: unknown,
  key: string,
  expectArray = true,
): T | undefined {
  if (value === undefined) return undefined;
  if (expectArray && !Array.isArray(value)) {
    console.warn(
      `[offline-list] "${key}" data arrived as ${value === null ? "null" : typeof value}` +
        ` instead of an array — ignoring it (the page renders empty / falls back to its snapshot` +
        ` rather than crashing with "map is not a function")`,
    );
    return undefined;
  }
  if (
    !expectArray &&
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
  ) {
    console.warn(
      `[offline-list] "${key}" data arrived as ${typeof value} instead of an object — ignoring it`,
    );
    return undefined;
  }
  return value as T;
}

export interface OfflineListOptions<T> {
  queryKey: unknown[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
  /**
   * First-paint value delivered by the route loader (serialized by TanStack
   * Start). Without it the client's very first render sees `undefined` where
   * the server saw data, and React regenerates the whole page with a
   * hydration-mismatch error on every load.
   */
  initialData?: T;
  /**
   * Declare the payload as an OBJECT when the consumer reads fields off it
   * rather than mapping it (home:discover, home:foryou, album:*). Default is
   * false = list shape: anything that is not an array is treated as
   * unavailable, so a corrupted server-fn envelope degrades to an empty
   * section or the offline snapshot instead of "x.map is not a function"
   * taking the whole page down.
   */
  objectData?: boolean;
}

export interface OfflineListResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** True when rendering last-known data with no connection. */
  isOfflineData: boolean;
}

export function useOfflineList<T>(
  key: string,
  options: OfflineListOptions<T>,
): OfflineListResult<T> {
  const online = useOnlineStatus();
  // Scope the snapshot by the query key. Keys for user-scoped lists already
  // contain user?.id, so switching accounts on one phone reads a different
  // snapshot instead of the previous account's.
  const scope = useMemo(
    () => options.queryKey.filter((p) => p != null).join(":"),
    [options.queryKey],
  );
  const query = useQuery({
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    enabled: options.enabled,
    staleTime: options.staleTime,
    initialData: options.initialData,
    retry: online ? undefined : false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as {
    data: T | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => void;
  };

  // Normalize BEFORE anything else. A corrupted server-fn envelope (string /
  // empty object) must never reach the render, and must never be written as
  // the offline snapshot — saving it would poison offline mode permanently.
  // The normalized value flows into the snapshot write, the snapshot fallback
  // decision and the returned `data`, so all three see the same thing.
  const data = normalizeListData<T>(query.data, key, !options.objectData);

  useEffect(() => {
    if (data !== undefined) saveSnapshot(key, data, scope);
  }, [key, data, scope]);

  const snapshot =
    data !== undefined || online
      ? undefined
      : normalizeListData<T>(
          (loadSnapshot<T>(key, scope) ?? undefined) as T | undefined,
          key,
          !options.objectData,
        );
  const resolved = data ?? snapshot;
  return {
    data: resolved,
    isLoading: query.isLoading && resolved === undefined,
    isError: query.isError && resolved === undefined,
    error: query.error,
    refetch: () => {
      query.refetch();
    },
    isOfflineData: snapshot !== undefined,
  };
}
