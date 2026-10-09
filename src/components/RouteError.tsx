import { useRouter } from "@tanstack/react-router";
import { RouteError } from "@/lib/route-error-boundary";

/**
 * Shared route error surface.
 *
 * Re-exported from lib/route-error-boundary, which owns the decision of whether
 * an error is genuinely broken or just "no connection right now". Kept as its own
 * module so the 32 routes that already import from here need no change.
 */
export { routeErrorComponent, RouteError } from "@/lib/route-error-boundary";

/**
 * For routes that wrote their own inline error screen.
 *
 * Nine routes had `errorComponent: ({ error, reset }) => (...)` with an
 * identical shape. Each is a place for the offline case to be forgotten, and
 * each was reachable offline. They now delegate, so one change covers all of
 * them instead of nine edits that could each drift.
 */
export function RouteErrorWithRetry({ error, title }: { error: unknown; title?: string }) {
  return <RouteError error={error} title={title} />;
}

export { useRouter };
