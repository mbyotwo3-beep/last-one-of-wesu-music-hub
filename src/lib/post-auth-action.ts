/**
 * "Continue" flow: when an anonymous user starts something that needs auth
 * (like, follow, save, invite…), the intent travels as URL params to /auth.
 * OAuth and email-confirmation round-trips wipe those params, so the intent
 * is also stashed in sessionStorage and replayed after the session appears —
 * the action completes and the user lands back where they started, the way
 * Google's continue-flow works. No raw errors, no dead ends.
 */

export interface PendingAction {
  action?: string;
  artistId?: string;
  itemId?: string;
  itemType?: string;
  redirect?: string;
  invite?: string;
}

const STORAGE_KEY = "pending_post_auth_action";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** Stash the intent before leaving /auth (OAuth redirect, signup submit). */
export function stashPendingAction(storage: StorageLike | undefined, a: PendingAction): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable — the URL params may still survive */
  }
}

/**
 * Read + consume the stashed intent (single-use). Returns null when absent
 * or malformed; non-string fields are dropped (never trusted).
 */
export function takePendingAction(storage: StorageLike | undefined): PendingAction | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    storage?.removeItem(STORAGE_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    return {
      action: asString(p.action),
      artistId: asString(p.artistId),
      itemId: asString(p.itemId),
      itemType: asString(p.itemType),
      redirect: asString(p.redirect),
      invite: asString(p.invite),
    };
  } catch {
    return null;
  }
}

/**
 * Fresh URL params win (current intent); the stash fills gaps left by an
 * OAuth/confirmation round-trip that wiped the query string.
 */
export function mergePendingAction(
  params: PendingAction,
  stashed: PendingAction | null,
): PendingAction {
  return {
    action: params.action ?? stashed?.action,
    artistId: params.artistId ?? stashed?.artistId,
    itemId: params.itemId ?? stashed?.itemId,
    itemType: params.itemType ?? stashed?.itemType,
    redirect: params.redirect ?? stashed?.redirect,
    invite: params.invite ?? stashed?.invite,
  };
}

/** True when there is anything worth replaying or anywhere to go. */
export function hasPendingAction(a: PendingAction): boolean {
  return !!(a.action || a.invite || a.redirect);
}

/** Same-origin app paths only — anything else falls back to the dashboard. */
export function safeAppRedirect(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}
