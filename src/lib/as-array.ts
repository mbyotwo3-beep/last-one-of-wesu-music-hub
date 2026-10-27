/**
 * Render-side array guard, same class as the XVFLAL home-shelf fix (ref
 * XVFLAL), the 4Y9EFV library fix and the 1UZXQ1 browse fix: a list source
 * that is neither null nor an array (stale snapshot shape, a future
 * server-fn serialization envelope, corrupted cache) must degrade to an
 * empty section instead of crashing the page with
 * "x.map is not a function" / "x.filter is not a function".
 *
 * Logs once per offender shape so an on-device report names its source
 * instead of a blind filter guard.
 */
export function asArrayLenient<T>(value: unknown, label: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value != null) {
    console.warn(
      `[list-guard] "${label}" arrived as ${typeof value} instead of an array — rendering it as empty`,
    );
  }
  return [];
}
