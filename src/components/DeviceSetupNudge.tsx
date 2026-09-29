import { useCallback, useEffect, useState } from "react";
import { BatteryCharging, Bell, ChevronDown, ChevronUp, X } from "lucide-react";
import { useIsNative } from "@/hooks/use-platform";
import {
  arePlaybackNotificationsEnabled,
  batteryExemptState,
  openPlaybackNotificationSettings,
  requestBatteryExemption,
} from "@/lib/native-audio";
import { batteryGuidance } from "@/lib/device-health";

const DISMISS_KEYS = {
  notif: "wesu:notif-nudge-dismissed",
  battery: "wesu:batt-nudge-dismissed",
};

type Issue = "notif" | "battery" | null;

function dismissed(kind: keyof typeof DISMISS_KEYS): boolean {
  try {
    return (
      typeof window !== "undefined" && window.localStorage?.getItem(DISMISS_KEYS[kind]) === "1"
    );
  } catch {
    return true;
  }
}

function remember(kind: keyof typeof DISMISS_KEYS) {
  try {
    window.localStorage?.setItem(DISMISS_KEYS[kind], "1");
  } catch {
    /* ignore */
  }
}

/**
 * The two device settings that silently break a music app: denied
 * notifications (no shade player, no lock-screen buttons) and battery
 * optimisation (music dies when the screen locks). Neither is fixable from
 * inside the app — vendor screens are user-only — so this offers one tap into
 * the right system dialog and the exact per-brand taps afterwards.
 * Shows at most one issue, highest first, and re-checks on every foreground.
 */
export function DeviceSetupNudge() {
  const isNative = useIsNative();
  const [issue, setIssue] = useState<Issue>(null);
  const [brand, setBrand] = useState("");
  const [stepsOpen, setStepsOpen] = useState(false);

  const check = useCallback(async () => {
    if (!isNative) return;
    try {
      // Notifications first: without them there are no controls at all.
      const notif = await arePlaybackNotificationsEnabled();
      if (notif === false && !dismissed("notif")) {
        setIssue("notif");
        return;
      }
      const battery = await batteryExemptState();
      if (battery && !battery.exempt && !dismissed("battery")) {
        setBrand(battery.brand);
        setIssue("battery");
        return;
      }
      setIssue(null);
    } catch {
      /* ignore */
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;
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
      remove?.();
    };
  }, [isNative, check]);

  if (!isNative || !issue) return null;

  const guidance = batteryGuidance(brand);
  const isNotif = issue === "notif";
  const copy = isNotif
    ? "Turn on notifications for lock-screen & shade controls"
    : "Keep music playing when the screen is off";
  const cta = isNotif ? "Enable" : "Allow";
  const act = isNotif
    ? () => void openPlaybackNotificationSettings()
    : () => void requestBatteryExemption();

  return (
    <div className="w-full bg-primary/12 border-b border-primary/25 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 font-semibold">
        {isNotif ? (
          <Bell className="size-3.5 text-primary shrink-0" />
        ) : (
          <BatteryCharging className="size-3.5 text-primary shrink-0" />
        )}
        <span className="flex-1 text-foreground">{copy}</span>
        <button
          type="button"
          onClick={act}
          className="px-3 py-1 rounded-full bg-primary text-primary-foreground font-semibold shrink-0"
        >
          {cta}
        </button>
        <button
          type="button"
          aria-label={stepsOpen ? "Hide steps" : "How to do this"}
          aria-expanded={stepsOpen}
          onClick={() => setStepsOpen((v) => !v)}
          className="p-1 text-muted-foreground hover:text-foreground shrink-0"
        >
          {stepsOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            remember(issue);
            setIssue(null);
          }}
          className="p-1 text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {stepsOpen ? (
        <ol className="mt-2 space-y-1 pl-5 list-decimal text-muted-foreground">
          {guidance.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
