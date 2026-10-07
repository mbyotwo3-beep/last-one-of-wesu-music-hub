/**
 * Turn anything thrown into a sentence a listener can act on.
 *
 * Server functions throw internal strings ("Missing Supabase environment
 * variable(s)…", "Unauthorized: Invalid token", raw PostgREST bodies). Those
 * used to be rendered verbatim — users saw infrastructure text on a page that
 * looked broken and knew nothing about what to do next.
 *
 * The rule: a message we wrote for humans passes through untouched; anything
 * else is replaced with a plain-language fallback. No internals leak.
 */

/** Substrings that identify our own, user-facing copy. */
const HUMAN_PATTERNS: RegExp[] = [
  /^You (must|need|can'?t|cannot|already|have|are|don'?t)/i,
  /^(Please |Enter |Choose |Select |Song |Artist |Album |Title |Genre |Email |Password|Price |Amount |Uploading |This |That |We |Your |Your upload|Failed to (send|add|save|submit|accept|update|create|upload|load)|Could not (send|add|save|submit|accept|update|create|upload)|Invalid |Not found|Are you sure|Something went wrong|Network )/i,
  /^(Total splits|Minimum withdrawal|Mobile money|Offline storage|Could not remove this download|This download is corrupted|Invitation |Artist |Label |Song |Playlist )/i,
];

/** Things a plain person can fix themselves. */
function selfInflicted(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match. Check for typos and try again.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "An account already exists with that email. Try signing in instead.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email address first — check your inbox for the link we sent.";
  }
  if (m.includes("password should be at least")) {
    return "Your password needs to be at least 6 characters.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) {
    return "No connection. Check your data or Wi-Fi and try again.";
  }
  if (m.includes("jwt") || m.includes("token") || m.includes("session")) {
    return "Your session expired. Sign in again to continue.";
  }
  return null;
}

/** Shape of an unknown throwable into a plain string. */
export function errorText(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as { message?: unknown; error?: unknown; error_description?: unknown };
    if (typeof e.message === "string") return e.message;
    if (typeof e.error_description === "string") return e.error_description;
    if (typeof e.error === "string") return e.error;
  }
  return "";
}

/**
 * Best-effort user-facing message. Falls back to `fallback` for anything that
 * doesn't read like copy a human was meant to see.
 */
export function friendlyError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw = errorText(error).trim();
  if (!raw) return fallback;

  const specific = selfInflicted(raw);
  if (specific) return specific;

  // Long/raw payloads (JSON bodies, SQL, stack-ish text) never pass through.
  if (raw.length > 240 || /[{}[\]]/.test(raw) || /\bSELECT\b|\bINSERT\b|\bpg_/i.test(raw)) {
    return fallback;
  }

  if (HUMAN_PATTERNS.some((re) => re.test(raw))) return raw;
  return fallback;
}
