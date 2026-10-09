import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WifiOff, Download, X } from "lucide-react";
import { toast } from "sonner";

import { useOfflineMode } from "@/stores/offline-mode";

export type OnlineTransition = "went-offline" | "went-online" | "none";

/** Pure: classify an online/offline edge (unit-tested). */
export function describeOnlineTransition(
  prevOnline: boolean,
  nowOnline: boolean,
): OnlineTransition {
  if (prevOnline && !nowOnline) return "went-offline";
  if (!prevOnline && nowOnline) return "went-online";
  return "none";
}

function readOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * Offline strip: shown when there is no data connection, OR when the listener
 * has switched Offline mode on.
 *
 * The two are different states and were previously conflated into "offline".
 * Spotify separates them:
 *
 *   - no connection  — the app cannot stream anything; downloads still play;
 *   - Offline mode   — the LISTENER chose to stop streaming, even with full
 *                      bars, and wants the app to behave as if it were offline.
 *
 * Only the first is automatic. Treating it as the only case meant there was no
 * way to ask for a download-only session on a good connection — useful on metered
 * data, and the thing listeners actually reach for.
 *
 * The mode is persisted, so it survives the cold starts the WebView is subject
 * to on mobile.
 */
export function OfflineBanner() {
  const navigate = useNavigate();
  const [online, setOnline] = useState<boolean>(() => readOnline());
  const wasOffline = useRef(false);
  const offlineMode = useOfflineMode();
  const { enabled, setEnabled, hydrate } = offlineMode;

  // The store boots false because it is evaluated during SSR, where storage does
  // not exist. Reading it here keeps the first client render in agreement with
  // what the listener last chose — and primes the vault index, so the very
  // first tap under Offline mode is filtered rather than slipping through.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const update = () => {
      const now = readOnline();
      setOnline((prev) => {
        const edge = describeOnlineTransition(prev, now);
        if (edge === "went-offline") {
          wasOffline.current = true;
        } else if (edge === "went-online" && wasOffline.current) {
          wasOffline.current = false;
          toast.success("Back online", {
            description: "Stream anything, or keep playing downloads.",
            action: {
              label: "Browse",
              onClick: () => navigate({ to: "/browse" }),
            },
          });
        }
        return now;
      });
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [navigate]);

  // Listener-chosen Offline mode: shown even when the connection is fine, and it
  // has to be dismissible, or they cannot get back to streaming.
  if (online && enabled) {
    return (
      <div
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary/15 border-b border-primary/30 text-xs"
        role="status"
      >
        <Download className="size-3.5 text-primary" />
        <span className="text-foreground font-semibold">Offline mode — downloads only</span>
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-bold text-primary-foreground hover:brightness-110 transition-all cursor-pointer"
        >
          Turn off
          <X className="size-3" />
        </button>
      </div>
    );
  }

  // Genuinely no connection.
  if (online) return null;
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/downloads" })}
      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs font-semibold hover:bg-amber-500/25 transition-colors cursor-pointer"
      aria-label="Offline — show my downloads"
    >
      <WifiOff className="size-3.5" />
      <span>Offline — your downloads still play</span>
    </button>
  );
}
