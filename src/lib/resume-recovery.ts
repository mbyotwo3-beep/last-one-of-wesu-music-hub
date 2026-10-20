/**
 * Route-error recovery rules for a WebView that just came back from the
 * background.
 *
 * WHY THIS EXISTS
 *
 * A listener reported /browse showing "This page didn't load" in the mobile
 * app — again — and the decisive detail was WHEN: after the app sat in the
 * background. Coming back from suspension, a WebView fails in a handful of
 * ways that all render the SAME screen:
 *
 *   - the access token expired while the process dozed, the silent refresh is
 *     still in flight when the resume burst calls server functions, and
 *     those calls reject with the middleware's "Unauthorized: ..." — a
 *     message no network-pattern catches, so the boundary draws the fault
 *     screen for what one token refresh would fix;
 *   - the WebView aborted in-flight requests on suspension — the error is
 *     AbortError-class, deliberately NOT classified offline by
 *     isOfflineTransportFailure (deliberate cancels must not fake offline),
 *     so it lands here as an unexplained fault;
 *   - a deploy landed while the app was open: the running shell references
 *     hashed chunks that no longer exist on the live deployment, and the
 *     import dies with "Failed to fetch dynamically imported module".
 *
 * For none of these is showing "This page didn't load" the best move. They
 * each have a single, silent, self-healing action:
 *     stale-chunk → reload the app once (fresh document, fresh hashes)
 *     auth        → refresh the session, then re-run the route once
 *     aborted     → re-run the route once
 * Anything NOT in this table stays an honest fault: the listener taps
 * Try again, and the reference code they can quote is unchanged.
 *
 * THE ONE-ATTEMPT RULE
 *
 * Each action is guarded per kind with its own memory window (held in
 * sessionStorage). A recovery that did not fix the fault must NOT run again:
 * an automatic loop that reloads or re-renders forever is worse than the
 * original error screen — it prevents the listener from ever seeing the
 * reference code. After one attempt per kind, the fault screen stands and
 * the guard expires later, so a NEW fault of the same kind can still heal.
 *
 * PURE. No DOM, no router, no supabase: the wiring lives in RouteError and
 * __root; this module only decides. The classifier takes the error object so
 * Error.name (AbortError never reaches the message) participates.
 */

export interface RecoveryGuard {
  reload?: number;
  reauth?: number;
  revalidate?: number;
}

export type RecoveryClass = "stale-chunk" | "auth" | "aborted" | "network" | "other";

export type RecoveryAction = "reload" | "reauth" | "revalidate" | "none";

export type RecoveryKind = "reload" | "reauth" | "revalidate";

/** Named for the screen the listener described — /browse after background. */
const CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load module script/i,
  /loading chunk \d+ failed/i,
  /dynamically imported module/i,
];

const AUTH_PATTERNS = [
  /unauthorized/i,
  /no authorization header/i,
  /invalid token/i,
  /token expired/i,
  /jwt/i,
  /refresh token/i,
  /invalid login credentials/i,
  /\b401\b/,
];

const ABORT_PATTERN = /abort/i;

/** "Timed out"-class: isOfflineTransportFailure does not catch these, so they
 * reach the fault screen even though one honest retry usually clears them. */
const NETWORK_PATTERN = /failed to fetch|network( |-)?error|load failed|net::|err_internet|err_network|timed? ?out|timeout/i;

export function errorClass(error: unknown): RecoveryClass {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  // Chunk skew first: its messages also match the network pattern, and the
  // chunk fix (reload) is strictly the right superset of a plain retry.
  if (CHUNK_PATTERNS.some((re) => re.test(message))) return "stale-chunk";
  if (name === "AbortError" || ABORT_PATTERN.test(message)) return "aborted";
  if (AUTH_PATTERNS.some((re) => re.test(message))) return "auth";
  if (NETWORK_PATTERN.test(message)) return "network";
  return "other";
}

/** Re-attempt windows, per action kind. Short enough to heal a NEW fault;
 * long enough that one failed attempt always ends in the honest screen. */
export const RECOVERY_WINDOWS_MS: Record<RecoveryKind, number> = {
  reload: 60_000,
  reauth: 150_000,
  revalidate: 45_000,
};

/**
 * Proactive resume refresh — the stopwatch, not the token clock.
 *
 * Doze freezes autoRefreshToken, so the risk window opens the moment the app
 * has been backgrounded for minutes, not seconds; tab flicks (a minute of
 * reading one screen, checking WhatsApp) are not suspensions and must not
 * burn a refresh round-trip. Whether the token is actually close to expiry
 * is refreshSessionIfStale's job and it re-checks that cheaply — this rule
 * only gates the resume moment itself.
 */
export function resumeRefreshDecision(i: {
  hiddenForMs: number;
  online: boolean;
}): "refresh" | "skip" {
  if (!i.online) return "skip";
  if (i.hiddenForMs < 180_000) return "skip";
  return "refresh";
}

export function recoveryDecision(i: {
  error: unknown;
  offline: boolean;
  guard: RecoveryGuard;
  nowMs: number;
}): RecoveryAction {
  // Offline is the OFFLINE-NOTICE's territory: a connection that is truly
  // down cannot be healed by a token refresh or a re-render, and reloading a
  // device with no link just brings back the same failure. Never act.
  if (i.offline) return "none";
  const cls = errorClass(i.error);
  switch (cls) {
    case "stale-chunk": {
      const last = i.guard.reload ?? 0;
      return i.nowMs - last >= RECOVERY_WINDOWS_MS.reload ? "reload" : "none";
    }
    case "auth": {
      const last = i.guard.reauth ?? 0;
      return i.nowMs - last >= RECOVERY_WINDOWS_MS.reauth ? "reauth" : "none";
    }
    case "aborted":
    case "network": {
      const last = i.guard.revalidate ?? 0;
      return i.nowMs - last >= RECOVERY_WINDOWS_MS.revalidate ? "revalidate" : "none";
    }
    default:
      return "none";
  }
}
