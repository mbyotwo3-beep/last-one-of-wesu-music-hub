import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { friendlyError } from "@/lib/friendly-error";
import { isOfflineTransportFailure } from "@/lib/loader-graceful";
import { OfflineRouteNotice } from "@/components/OfflineRouteNotice";

/**
 * A short, stable reference for one failure.
 *
 * WHY THIS EXISTS
 *
 * A listener reported that /library showed "This page didn't load". Every cause
 * was ruled out by reading the code: no loader on that route, all four queries
 * guarded and falling back to [], no unguarded property access, the one explicit
 * `throw` sitting in a mutation with an onError handler, and /library
 * server-rendering fine (200, real content) for an anonymous visitor.
 *
 * The remaining difference between the passing case and the failing one was
 * simply THAT THE REPORTER WAS SIGNED IN, and no amount of reading told us which
 * signed-in branch threw.
 *
 * The boundary was handed the error and discarded it. Every report since has been
 * a screenshot to be guessed at, and guessing has been wrong repeatedly.
 *
 * Deliberately short and non-secret: enough for a listener to read back, never
 * the message or a stack trace. The full error goes to the console.
 */
export function errorReference(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  // Same fault, same reference. Not a hash of anything sensitive — just the
  // message, folded.
  let h = 0;
  for (let i = 0; i < message.length; i++) h = (h * 31 + message.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

/**
 * Shared route error surface for every route.
 *
 * One place decides whether a failure is a real fault or simply no connection,
 * so a new route cannot get it wrong by writing its own screen.
 */
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

  // Log it. Without this the reason is gone the moment the boundary renders and
  // the only record is a screenshot with no detail on it.
  if (typeof console !== "undefined") {
    console.error("[route-error]", error);
  }

  if (isOfflineTransportFailure(error)) {
    return <OfflineRouteNotice />;
  }

  const ref = errorReference(error);
  const message = friendlyError(
    error,
    fallback ?? "We couldn't load this right now. Check your connection and try again.",
  );

  return (
    <div className="px-6 py-16 text-center max-w-md mx-auto">
      <div className="inline-flex items-center justify-center size-14 rounded-full bg-destructive/10 mb-4">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h1 className="text-xl font-bold mb-2">{title}</h1>
      <p className="text-muted-foreground text-sm mb-6">{message}</p>
      <button
        onClick={() => router.invalidate()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] cursor-pointer"
      >
        <RefreshCw className="size-4" />
        Try again
      </button>
      {/* Visible, not screen-reader-only: the person looking at this screen is
          the one who has to read the code back to us. */}
      <p className="mt-6 text-[11px] text-muted-foreground/70">
        If this keeps happening, quote reference{" "}
        <span className="font-mono font-semibold text-muted-foreground">{ref}</span> when you report
        it.
      </p>
    </div>
  );
}

/** Drop-in for `errorComponent: ({ error }) => ...`. */
export function routeErrorComponent(title?: string) {
  return function ErrorComponent({ error }: { error: unknown }) {
    return <RouteError error={error} title={title} />;
  };
}

/** Kept for routes that imported it while delegating to the shared surface. */
export function RouteErrorWithRetry({ error, title }: { error: unknown; title?: string }) {
  return <RouteError error={error} title={title} />;
}

export { useRouter };
