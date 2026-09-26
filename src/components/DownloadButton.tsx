import { Download, Loader2, Check } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getDownloadAudioUrl } from "@/lib/listener.functions";
import { useAuth } from "@/hooks/use-auth";
import { useIsNative, useIsMobile } from "@/hooks/use-platform";
import { useSongEntitlement } from "@/hooks/use-song-entitlement";
import { supabase } from "@/integrations/supabase/client";
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

/**
 * User-facing download failure text. Pure (unit-tested): never surfaces raw
 * errors or URLs — purchase blocks become a Buy nudge, offline becomes a
 * connectivity nudge.
 */
export function mapDownloadError(raw: unknown, online: boolean): string {
  if (!online) return "You're offline — connect to download songs";
  const msg = raw instanceof Error ? raw.message : "Download failed";
  if (/purchase|buy|entitl|unlock|payment|402|403/i.test(msg)) {
    return "Available after purchase — buy this track to download it";
  }
  return msg;
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
  // Price comes from the row itself (no new props for 14 call sites): one
  // tiny cached lookup per song, shared across every button for it.
  const { data: songInfo } = useQuery({
    queryKey: ["song-download-info", songId],
    queryFn: async () => {
      const { data } = await supabase
        .from("songs")
        .select("price,album_id")
        .eq("id", songId)
        .maybeSingle();
      return data as { price: number | null; album_id: string | null } | null;
    },
    enabled: !!songId && !!user,
    staleTime: 5 * 60 * 1000,
  });
  const price = Number(songInfo?.price ?? 0);
  const { owned, loading: entLoading } = useSongEntitlement(
    songId,
    songInfo ? price : null,
    songInfo?.album_id ?? null,
  );

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
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      setError(mapDownloadError(err, online));
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

  // Spotify-style: unbought paid tracks offer Buy, not a Download button
  // that can only fail. Free/owned tracks fall through to Download.
  if (!entLoading && price > 0 && !owned) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Link
          to="/checkout"
          search={{ item: "song", id: songId }}
          className={buttonClass}
          aria-label={`Buy ${title ?? "song"}`}
          title="Buy this track to download it"
        >
          <Download className="size-3.5" />
          Buy K{price.toFixed(0)}
        </Link>
      </span>
    );
  }

  // While the price/entitlement is still loading we don't know whether
  // this should be Buy or Download — show an inert button instead of a
  // Download that can only fail with a purchase error.
  if (songInfo === undefined || entLoading) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button type="button" disabled className={buttonClass} aria-label={`${label} song`}>
          <Loader2 className="size-3.5 animate-spin" />
          {label}
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
