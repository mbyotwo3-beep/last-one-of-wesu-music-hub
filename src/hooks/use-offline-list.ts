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

export interface OfflineListOptions<T> {
  queryKey: unknown[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
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
    retry: online ? undefined : false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as {
    data: T | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => void;
  };

  useEffect(() => {
    if (query.data !== undefined) saveSnapshot(key, query.data, scope);
  }, [key, query.data, scope]);

  const snapshot =
    query.data !== undefined || online ? undefined : (loadSnapshot<T>(key, scope) ?? undefined);
  const data = query.data ?? snapshot;
  return {
    data,
    isLoading: query.isLoading && data === undefined,
    isError: query.isError && data === undefined,
    error: query.error,
    refetch: () => {
      query.refetch();
    },
    isOfflineData: snapshot !== undefined,
  };
}
