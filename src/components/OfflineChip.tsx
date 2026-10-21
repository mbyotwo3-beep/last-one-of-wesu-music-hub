import { WifiOff } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { useOfflineAvailability } from "@/hooks/use-offline-availability";
import { describeOfflineChip } from "@/lib/offline-availability";

/**
 * The offline chip: a small persistent pill in the header, the way Spotify does it.
 *
 * WHAT CHANGED AND WHY
 *
 * This replaces a full-width strip that pushed the page content down when it
 * appeared and disappeared again when it went. That is the loudest possible
 * treatment for a state that is often permanent for a week — someone who flies
 * would live with a banner eating vertical space on every screen, every time.
 *
 * There is exactly ONE offline state now — the network is down — so there is
 * exactly one pill. The retired "Offline mode" variant (cloud-off icon, plus a
 * "Turn off" button) is gone: offline no longer needs to be asked for or
 * dismissed. YouTube and Spotify never require the listener to understand a
 * mode; the app simply reacts to losing the connection, and the pill only has
 * to say what that reaction is.
 *
 * Spotify's version is a quiet pill in the top bar. It is always visible, it
 * never moves the layout, and it never asks to be dismissed: it is a status, not
 * a notification.
 *
 * The wording comes from `describeOfflineChip` in lib/offline-availability so
 * the player's error messages and this pill never drift apart.
 */
export function OfflineChip({ className = "" }: { className?: string }) {
  const { noConnection } = useOfflineAvailability();

  const copy = describeOfflineChip(!noConnection, false);
  if (!copy) return null;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 backdrop-blur ${className}`}
      role="status"
      aria-live="polite"
      data-offline-chip="no-connection"
    >
      <WifiOff className="size-3.5 text-amber-400" aria-hidden />
      <span>{copy.label}</span>
      {/* The one action actually available with no network. */}
      <Link
        to="/downloads"
        className="ml-1 rounded-full bg-white/10 px-2 py-0.5 font-bold text-white hover:bg-white/20 transition-colors cursor-pointer"
      >
        Downloads
      </Link>
    </div>
  );
}

export { describeOfflineChip };
