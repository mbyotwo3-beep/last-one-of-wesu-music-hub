import { CloudOff, WifiOff } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useOfflineAvailability } from "@/hooks/use-offline-availability";
import { useOfflineMode } from "@/stores/offline-mode";
import { describeOfflineChip } from "@/lib/offline-availability";

/**
 * The offline chip: a small persistent pill in the header, the way Spotify does it.
 *
 * WHAT CHANGED AND WHY
 *
 * This replaces a full-width strip that pushed the page content down when it
 * appeared and disappeared again when it went. That is the loudest possible
 * treatment for a state that is often permanent for a week — someone who flies,
 * or who turns downloads-only on to save data, would live with a banner eating
 * vertical space on every screen, every time.
 *
 * Spotify's version is a quiet pill in the top bar. It is always visible, it
 * never moves the layout, and it never asks to be dismissed: it is a status, not
 * a notification. It also distinguishes the two states, which the strip never
 * did clearly:
 *
 *   wifi-off   "No connection"  — the network is down. Downloads still play.
 *   cloud-off  "Offline mode"  — you chose downloads-only. Turn it off.
 *
 * Those need different actions from the listener, and a single "offline" label
 * makes both look like the network's fault — which sends people to airplane mode
 * when the fix is one tap away.
 *
 * The wording comes from `describeOfflineChip` in lib/offline-availability so
 * the label cannot drift from the rule the player is using.
 */
export function OfflineChip({ className = "" }: { className?: string }) {
  const { offline, noConnection, modeOn } = useOfflineAvailability();
  const setEnabled = useOfflineMode((s) => s.setEnabled);

  const copy = describeOfflineChip(!noConnection, modeOn);
  if (!offline || !copy) return null;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 backdrop-blur ${className}`}
      role="status"
      aria-live="polite"
      data-offline-chip={copy.action === "downloads" ? "no-connection" : "mode"}
    >
      {copy.action === "downloads" ? (
        <>
          <WifiOff className="size-3.5 text-amber-400" aria-hidden />
          <span>{copy.label}</span>
          {/* The one action actually available with no network. */}
          <Link
            to="/downloads"
            className="ml-1 rounded-full bg-white/10 px-2 py-0.5 font-bold text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            Downloads
          </Link>
        </>
      ) : (
        <>
          <CloudOff className="size-3.5 text-zinc-400" aria-hidden />
          <span>{copy.label}</span>
          <button
            type="button"
            onClick={() => setEnabled(false)}
            className="ml-1 rounded-full bg-white/10 px-2 py-0.5 font-bold text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            Turn off
          </button>
        </>
      )}
    </div>
  );
}

export { describeOfflineChip };