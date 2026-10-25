import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { friendlyError } from "@/lib/friendly-error";
import { isOfflineTransportFailure } from "@/lib/loader-graceful";
import {
  recoveryDecision,
  type RecoveryAction,
  type RecoveryGuard,
  type RecoveryKind,
} from "@/lib/resume-recovery";
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
 * One attempt per kind, remembered here — sessionStorage survives a WebView
 * renderer restore (the exact resume case being healed), so the guard holds
 * across it. Marking happens BEFORE the action; a recovery that cannot be
 * recorded does not run, because an unremembered auto-reload is the infinite
 * loop this whole design exists to prevent.
 */
const RECOVERY_KEY = "wesu:recovery";

function loadRecoveryGuard(): RecoveryGuard {
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RecoveryGuard;
    return typeof parsed === "object" && parsed !== null ? (parsed as RecoveryGuard) : {};
  } catch {
    return {};
  }
}

function markRecoveryAttempt(kind: RecoveryKind, nowMs: number): boolean {
  try {
    const guard = { ...loadRecoveryGuard(), [kind]: nowMs };
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(guard));
    return true;
  } catch {
    return false;
  }
}

async function runRecovery(
  action: RecoveryAction,
  router: ReturnType<typeof useRouter>,
  setHealing: (h: boolean) => void,
): Promise<void> {
  if (action === "reload") {
    if (!markRecoveryAttempt("reload", Date.now())) return;
    setHealing(true);
    // A beat of the healing screen so the swap isn't a flash, then a full
    // reload — the fresh document carries fresh hashes and the dead chunk
    // reference is gone.
    window.setTimeout(() => window.location.reload(), 600);
    return;
  }
  if (action === "reauth") {
    if (!markRecoveryAttempt("reauth", Date.now())) return;
    setHealing(true);
    try {
      // Dynamic import: the browser Supabase client has no business in the
      // SSR graph of this shared error surface.
      const { refreshSessionIfStale } = await import("@/lib/session-resume");
      const ok = await refreshSessionIfStale();
      // A refresh can succeed while the router is re-running the route, in
      // which case the route replaces this component — healing(null) on an
      // unmounted boundary is harmless. If the refresh failed, the honest
      // fault screen (with Try again) stands.
      if (ok) await router.invalidate();
    } finally {
      setHealing(false);
    }
    return;
  }
  if (action === "revalidate") {
    if (!markRecoveryAttempt("revalidate", Date.now())) return;
    setHealing(true);
    try {
      await router.invalidate();
    } finally {
      setHealing(false);
    }
  }
}

/**
 * Shared route error surface for every route.
 *
 * One place decides whether a failure is a real fault or simply no connection,
 * so a new route cannot get it wrong by writing its own screen.
 *
 * And for the failures a WebView produces coming back from the background,
 * one place now HEALS them silently first — exactly once per kind per
 * session window, then honest: a recovery that did not fix the fault always
 * ends on this screen.
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

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const [healing, setHealing] = useState(false);
  // Decided at mount from THIS error object. useMemo keeps the decision from
  // being recomputed on parent re-renders while the effect below acts.
  const recovery = useMemo(() => {
    if (isOfflineTransportFailure(error)) return "none" as const;
    return recoveryDecision({
      error,
      offline,
      guard: loadRecoveryGuard(),
      nowMs: Date.now(),
    });
  }, [error, offline]);

  useEffect(() => {
    if (recovery === "none") return;
    void runRecovery(recovery, router, setHealing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recovery]);

  if (isOfflineTransportFailure(error)) {
    return <OfflineRouteNotice />;
  }

  if (healing) {
    const line =
      recovery === "reload"
        ? "Updating Wesu+…"
        : recovery === "reauth"
          ? "Signing you back in…"
          : "Reconnecting…";
    return (
      <div className="px-6 py-24 text-center max-w-md mx-auto" role="status">
        <Loader2
          className="mx-auto size-7 animate-spin text-muted-foreground mb-4"
          aria-hidden="true"
        />
        <p className="text-muted-foreground text-sm">{line}</p>
      </div>
    );
  }

  const ref = errorReference(error);
  const message = friendlyError(
    error,
    fallback ?? "We couldn't load this right now. Check your connection and try again.",
  );
  // TEMP DIAGNOSTIC (launch sweep): the capped stack names the exact module
  // and call position of whatever failed the route — a lookup instead of a
  // guess. Remove once native boot is proven clean.
  const stackRaw = typeof (error as { stack?: unknown }).stack === "string" ? (error as { stack: string }).stack : "";
  const stackFirst = stackRaw ? stackRaw.replace(/\s+/g, " ").trim().slice(0, 560) : "";

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
      {/* TEMP DIAGNOSTIC (launch sweep): on-device stack readout. */}
      {stackFirst && (
        <p className="mt-3 text-[11px] font-mono text-muted-foreground/70 break-words">
          stack {stackFirst}
        </p>
      )}
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
