import { useRouter } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { isOfflineTransportFailure } from "@/lib/loader-graceful";
import { OfflineRouteNotice } from "@/components/OfflineRouteNotice";

/**
 * Decide what a route error should look like, so no route has to re-implement it.
 *
 * WHY A HELPER INSTEAD OF CHANGING 40 errorComponents
 *
 * Offline, a detail route's fetch rejects and lands on its errorComponent. The
 * generic screen is wrong twice: a red warning icon implies something is broken,
 * and "Try again" re-runs a request that cannot succeed with no data.
 *
 * Most routes share one error component (32 of them), so changing that covered
 * nearly everything. The rest wrote their own inline. Rather than edit nine
 * near-duplicates — each a chance to introduce a difference — they all delegate
 * here.
 *
 * This also deliberately does NOT touch the component tree, so there is no way
 * for it to skip a hook. An earlier attempt at the offline problem put an early
 * return inside a component before its remaining hooks, which crashes on
 * reconnect with "rendered fewer hooks than expected". Centralising it in the
 * error surface avoids that entirely.
 */

/** The error boundary to hand a route, given what it wants to call itself. */
export function routeErrorComponent(title?: string) {
  return function ErrorComponent({ error }: { error: unknown }) {
    return <RouteError error={error} title={title} />;
  };
}

export function RouteError({
  error,
  title = "This page didn't load",
  fallback,
}: {
  error: unknown;
  title?: string;
  fallback?: string;
}) {
  const router = useRouter();

  if (isOfflineTransportFailure(error)) {
    return <OfflineRouteNotice />;
  }

  const message = friendlyError(
    error,
    fallback ?? "We couldn't load this right now. Check your connection and try again.",
  );

  return (
    <div className="px-6 py-16 text-center max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">{title}</h1>
      <p className="text-muted-foreground text-sm mb-6">{message}</p>
      <button
        onClick={() => router.invalidate()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
