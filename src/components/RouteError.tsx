import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { friendlyError } from "@/lib/friendly-error";

/**
 * Shared route error surface.
 *
 * Dozens of routes rendered `{error.message}` straight to the screen. Those
 * messages are server-internal ("Unauthorized: Invalid token", "Missing
 * Supabase environment variable(s)…", raw PostgREST JSON), so a transient
 * failure showed a listener infrastructure text and no way forward. This
 * shows a human sentence plus a retry.
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
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold min-h-[44px]"
      >
        <RefreshCw className="size-4" />
        Try again
      </button>
    </div>
  );
}

/** Drop-in for `errorComponent: ({ error }) => ...`. */
export function routeErrorComponent(title?: string) {
  return function ErrorComponent({ error }: { error: unknown }) {
    return <RouteError error={error} title={title} />;
  };
}
