import { Download, Loader2, Check } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getDownloadAudioUrl } from "@/lib/listener.functions";
import { useAuth } from "@/hooks/use-auth";
import { useIsNative, useIsMobile } from "@/hooks/use-platform";
import {
  isTrackDownloaded,
  downloadSongToVault,
  removeTrackFromVault,
  isVaultSupported,
} from "@/lib/offline-vault";

interface DownloadButtonProps {
  songId: string;
  label?: string;
  title?: string;
  artistName?: string;
  coverUrl?: string | null;
}

/** Refresh every download button after a vault change. */
export function touchVaultQueries(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: ["vault-track"] });
}

export function useVaultDownloaded(songId: string | null | undefined) {
  return useQuery({
    queryKey: ["vault-track", songId],
    queryFn: () => isTrackDownloaded(songId ?? ""),
    enabled: !!songId,
    staleTime: Infinity,
  });
}

/**
 * Offline download control.
 *
 * - Desktop browser / native app → downloads into the encrypted on-device
 *   vault (AES-GCM, device-bound key). Files are never saved as playable
 *   audio and can only be played back inside this app.
 * - Mobile browser → routes to /get-app instead (offline listening lives
 *   in the native app; the admin configures the store links in Settings).
 * - Tapping a downloaded track removes it from this device.
 */
export function DownloadButton({
  songId,
  label = "Download",
  title,
  artistName,
  coverUrl,
}: DownloadButtonProps) {
  const { user } = useAuth();
  const isNative = useIsNative();
  const isMobile = useIsMobile();
  const downloadFn = useServerFn(getDownloadAudioUrl);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [progressBytes, setProgressBytes] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const { data: downloaded } = useVaultDownloaded(songId);

  // Downloads are an authenticated feature. Hide the control for anonymous
  // listeners instead of showing a button that can only fail with 401.
  if (!user) return null;

  const buttonClass =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary border border-border text-xs font-semibold hover:bg-accent transition-colors disabled:opacity-50";

  // Mobile browsers can't hold offline vaults reliably and shouldn't juggle
  // large files — send them to the native app instead.
  if (!isNative && isMobile) {
    return (
      <Link
        to="/get-app"
        className={buttonClass}
        aria-label={`${label} — get the Wesu+ app`}
        title="Downloads live in the Wesu+ app"
      >
        <Download className="size-3.5" />
        {label}
      </Link>
    );
  }

  if (!isVaultSupported()) return null;

  async function download() {
    if (progress !== null) return;
    setProgress(0);
    setProgressBytes(0);
    setError(null);
    try {
      // Entitlement (purchase / free / staff / owner-artist) is enforced
      // server-side — the signed URL is only minted for allowed callers.
      await downloadSongToVault(
        async (id) => {
          const result = await downloadFn({ data: { song_id: id } });
          return { url: result.url, filename: result.filename };
        },
        { songId, title, artistName, coverUrl },
        (pct, bytes) => {
          setProgress(pct);
          if (typeof bytes === "number") setProgressBytes(bytes);
        },
      );
      // Invalidate first so the button flips to Downloaded only when the
      // vault query confirms it — no double-download window.
      await touchVaultQueries(qc);
      toast.success(`Downloaded "${title ?? "song"}" — plays offline, only in Wesu+`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      // Unbought paid tracks fail server-side: say so instead of a raw error.
      setError(
        /purchase|buy|entitl|unlock|payment|402|403/i.test(msg)
          ? "Available after purchase — buy this track to download it"
          : msg,
      );
    } finally {
      setProgress(null);
    }
  }

  async function remove() {
    try {
      // Removing the currently-playing track would kill playback mid-song
      // with a generic audio error — stop it first.
      try {
        const { usePlayer } = await import("@/stores/player");
        if (usePlayer.getState().track?.id === songId) {
          usePlayer.getState().exitSong();
        }
      } catch {
        /* player unavailable — proceed with removal */
      }
      await removeTrackFromVault(songId);
      await touchVaultQueries(qc);
      toast.success("Download removed from this device");
    } catch {
      toast.error("Could not remove this download");
    }
  }

  if (downloaded) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={remove}
          className={buttonClass}
          aria-label="Remove download"
          title="Downloaded — tap to remove from this device"
        >
          <Check className="size-3.5 text-primary" />
          Downloaded
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={progress !== null}
        className={buttonClass}
        aria-label={`${label} song`}
      >
        {progress !== null ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        {progress !== null
          ? progress > 0
            ? `${progress}%`
            : progressBytes > 0
              ? `${(progressBytes / 1048576).toFixed(1)} MB`
              : "Preparing…"
          : label}
      </button>
      {error && <span className="text-[10px] text-destructive max-w-40 text-right">{error}</span>}
    </span>
  );
}
