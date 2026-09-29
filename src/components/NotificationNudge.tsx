import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useIsNative } from "@/hooks/use-platform";
import {
  arePlaybackNotificationsEnabled,
  openPlaybackNotificationSettings,
} from "@/lib/native-audio";

const DISMISS_KEY = "wesu:notif-nudge-dismissed";

function isDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem(DISMISS_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * One-tap path back to working shade controls: when notifications are
 * denied the player notification (and lock-screen buttons) cannot exist at
 * all — the top cause of "no notification buttons" reports. Shown until
 * allowed or dismissed; re-checks every time the app returns foreground.
 */
export function NotificationNudge() {
  const isNative = useIsNative();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    const check = async () => {
      try {
        if (isDismissed()) return;
        const enabled = await arePlaybackNotificationsEnabled();
        if (!cancelled) setShow(enabled === false);
      } catch {
        /* ignore */
      }
    };
    void check();
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void check();
        });
        remove = () => handle.remove();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [isNative]);

  if (!isNative || !show) return null;
  const dismiss = () => {
    try {
      window.localStorage?.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return (
    <div className="w-full flex items-center gap-2 px-4 py-2 bg-primary/15 border-b border-primary/25 text-xs font-semibold">
      <Bell className="size-3.5 text-primary shrink-0" />
      <span className="flex-1 text-foreground">
        Turn on notifications for lock-screen &amp; shade controls
      </span>
      <button
        type="button"
        onClick={() => void openPlaybackNotificationSettings()}
        className="px-3 py-1 rounded-full bg-primary text-primary-foreground font-semibold shrink-0"
      >
        Enable
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="p-1 text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
