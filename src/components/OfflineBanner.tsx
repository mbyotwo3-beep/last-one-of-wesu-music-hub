import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";

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
 * Offline mode strip: while there is no data connection every page shows a
 * one-tap route into the on-device downloads (which play with zero bars,
 * Spotify-style). The moment data returns, a toast invites the listener
 * back to streaming. Fires each transition, never on first paint.
 */
export function OfflineBanner() {
  const navigate = useNavigate();
  const [online, setOnline] = useState<boolean>(() => readOnline());
  const wasOffline = useRef(false);

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

  if (online) return null;
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/downloads" })}
      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs font-semibold hover:bg-amber-500/25 transition-colors cursor-pointer"
      aria-label="Offline — show my downloads"
    >
      <WifiOff className="size-3.5" />
      <span>Offline — tap for your downloads</span>
    </button>
  );
}
