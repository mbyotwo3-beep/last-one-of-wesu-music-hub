import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

import { getVaultUsage, isVaultSupported, listVaultMeta } from "@/lib/offline-vault";

/**
 * What is actually true on THIS device, right now.
 *
 * WHY THIS EXISTS
 *
 * "Offline doesn't work" has been reported several times with screenshots that
 * could mean at least five different failures:
 *
 *   - the app never started, so there was nothing to report from;
 *   - the service worker is unsupported in this particular WebView;
 *   - it registered but never took control of the page;
 *   - it took control but the shell was never cached;
 *   - the vault is fine and the problem is audio playback.
 *
 * Every one of those LOOK IDENTICAL from the outside — an error page. Guessing has
 * been the wrong move repeatedly, so the app now states which of them is true.
 * One screenshot of this panel answers what ten guesses cannot.
 *
 * Deliberately read-only. It runs no downloads, clears nothing and changes no
 * setting, so it is safe to show to a listener and safe to screenshot.
 */

type Check = {
  label: string;
  ok: boolean | null; // null = cannot tell
  detail: string;
};

export function OfflineDiagnostics() {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [vaultLine, setVaultLine] = useState<string>("checking…");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const out: Check[] = [];

      out.push({
        label: "Internet",
        ok: navigator.onLine,
        detail: navigator.onLine ? "connected" : "no connection",
      });

      // Service worker support. This is the one that varies by device: an old or
      // OEM-frozen Android System WebView can lack it, and there is no fix short
      // of the user updating their WebView.
      const swSupported = "serviceWorker" in navigator;
      out.push({
        label: "This WebView supports offline caching",
        ok: swSupported,
        detail: swSupported
          ? "yes"
          : "Android System WebView is too old — update it in the Play Store",
      });

      // Registered? Controlling? These are different states and were being
      // treated as one.
      if (swSupported) {
        const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
        out.push({
          label: "Offline cache installed",
          ok: !!reg,
          detail: reg ? "yes" : "no — open the app once with internet",
        });

        const controlled = !!navigator.serviceWorker.controller;
        out.push({
          label: "Offline cache is in charge of this page",
          ok: controlled,
          detail: controlled ? "yes" : "no — this page was not served from cache",
        });

        // What is actually cached. An empty cache with a registered worker means
        // the install step failed, which is a different bug from no worker.
        try {
          const keys = await caches.keys();
          let entries = 0;
          let bytes = 0;
          for (const k of keys) {
            const c = await caches.open(k);
            const reqs = await c.keys();
            entries += reqs.length;
          }
          out.push({
            label: "Pages saved for offline",
            ok: entries > 0,
            detail: `${entries} saved across ${keys.length} cache(s)`,
          });
          void bytes;
        } catch {
          out.push({
            label: "Pages saved for offline",
            ok: null,
            detail: "could not read storage",
          });
        }
      }

      // The vault. Downloads are stored here; this is the direct answer to "are
      // my downloads actually being kept".
      const supported = isVaultSupported();
      out.push({
        label: "Phone can store downloads",
        ok: supported,
        detail: supported ? "yes" : "no — private storage is blocked",
      });
      if (supported) {
        try {
          const [meta, usage] = await Promise.all([listVaultMeta(), getVaultUsage()]);
          setVaultLine(
            meta.length === 0
              ? "No downloads on this device yet"
              : `${meta.length} song(s), ${(usage.bytes / 1048576).toFixed(1)} MB`,
          );
          out.push({
            label: "Songs downloaded",
            ok: meta.length > 0,
            detail: meta.length === 0 ? "none yet" : `${meta.length}`,
          });
        } catch {
          setVaultLine("Could not read the download vault");
        }
      } else {
        setVaultLine("Downloads are unavailable on this phone");
      }

      if (!cancelled) setChecks(out);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const failing = (checks ?? []).filter((c) => c.ok === false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left cursor-pointer"
      >
        <span className="text-sm font-semibold text-foreground">Offline status</span>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {!open ? (
        // The one line that matters without opening anything.
        <p className="px-4 pb-3 text-xs text-muted-foreground -mt-1">
          {checks === null
            ? "Checking…"
            : failing.length === 0
              ? `Working${vaultLine === "No downloads on this device yet" ? "" : ""}. ${vaultLine}.`
              : `${failing.length} thing(s) not ready. Tap to see.`}
        </p>
      ) : (
        <div className="px-4 pb-4 space-y-2">
          {checks === null ? (
            <p className="text-xs text-muted-foreground">Checking…</p>
          ) : (
            <>
              {checks.map((c) => (
                <div key={c.label} className="flex items-start gap-2 text-xs">
                  {c.ok === true ? (
                    <CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" />
                  ) : c.ok === false ? (
                    <XCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <HelpCircle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <span className="min-w-0">
                    <span className="text-foreground">{c.label}</span>
                    <span className="block text-muted-foreground">{c.detail}</span>
                  </span>
                </div>
              ))}

              <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                {vaultLine}
              </p>

              {failing.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  If offline does not work, the first ✗ above is why. A screenshot of this panel
                  tells us exactly what to fix.
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
