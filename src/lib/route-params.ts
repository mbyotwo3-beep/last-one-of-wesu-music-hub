/**
 * Route-parameter guards.
 *
 * These ids are interpolated straight into PostgREST `.eq("id", value)`
 * filters, which are uuid columns. A malformed id ("does-not-exist", a stale
 * short link, a typo in a shared URL) makes Postgres raise
 * `invalid input syntax for type uuid`, which surfaced to the listener as a
 * 500 page reading "Failed: invalid input syntax for type uuid" — a raw
 * database error shown to the public, on a URL anyone can produce by accident.
 *
 * Rejecting the shape up front turns all of that into an honest 404.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A canonical, lowercase uuid — safe to interpolate into a query. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value.trim());
}

/**
 * A slug: lowercase letters, digits, hyphens, underscores. Deliberately
 * permissive for label/artist slugs, but it can never inject a uuid cast
 * failure because the characters Postgres chokes on are excluded.
 */
export function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 120 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}
