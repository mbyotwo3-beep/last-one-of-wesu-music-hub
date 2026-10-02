import { Download, Loader2, Check } from "lucide-react";
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
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
  // A full phone is the most common failure on the low-end devices this app
  // runs on, and the browser throws a raw DOM string for it. Without this the
  // listener saw "QuotaExceededError: Failed to execute 'setItem'…".
  if (/quota|storage|space|ENOSPC|exceed/i.test(msg)) {
    return "Not enough space on your phone — free up some storage and try again";
  }
  if (/network|timeout|offline|fetch|ENOTFOUND/i.test(msg)) {
    return "Download interrupted — check your connection and try again";
  }
  if (/decrypt|vault|key/i.test(msg)) {
    return "This download needs re-verifying — download it again";
  }
  // Anything else passes through as before: no URL or signed token is minted
  // on this path, so the message carries no secret, and a specific server
  // error ("Download failed (500)") is more useful to a listener than a
  // generic "try again".
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
 * Offline download control — icon-only (Spotify-style compact rows).
 *
 * - Bought / free / staff / owner-artist → tap downloads into the encrypted
 *   on-device vault (AES-GCM, device-bound key). Files are never saved as
 *   playable audio and only play inside this app.
 * - Not bought → tap goes straight to checkout to buy it.
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr ?? "" });
  const downloadFn = useServerFn(getDownloadAudioUrl);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
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

  // Icon-only control: the text pill pushed row content around and hid
  // metadata on small screens. Unbought tracks lead to checkout, where
  // the price is shown before anything is charged.
  const buttonClass =
    "inline-flex items-center justify-center size-11 min-h-\[44px\] min-w-\[44px\] shrink-0 rounded-full bg-secondary border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50";
  const iconClass = "size-4";

  // Anonymous listeners get a download icon that leads to sign-in (with a
  // post-login return) — never a dead button, and never a 401 failure.
  if (!user) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Link
          to="/auth"
          search={{ redirect: pathname + searchStr }}
          className={buttonClass}
          aria-label="Sign in to download"
          title="Sign in to download"
        >
          <Download className={iconClass} />
        </Link>
      </span>
    );
  }

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
        <Download className={iconClass} />
      </Link>
    );
  }

  // Previously the control vanished entirely where the encrypted vault is not
  // available, so on those platforms the download feature simply did not
  // exist with no explanation — and a listener who had already downloaded in
  // the app had no way to reach their downloads. Say where it lives instead.
  if (!isVaultSupported()) {
    return (
      <Link
        to="/get-app"
        className="inline-flex size-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-secondary border border-border text-foreground transition-colors hover:bg-accent"
        aria-label="Offline downloads are available in the Wesu+ Android app"
        title="Offline downloads are available in the Wesu+ app"
      >
        <Download className={iconClass} />
      </Link>
    );
  }

  async function download() {
    if (progress !== null) return;
    setProgress(0);
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
        (pct) => {
          setProgress(pct);
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
          <Check className={`${iconClass} text-primary`} />
        </button>
      </span>
    );
  }

  // Spotify-style: unbought paid tracks offer Buy, not a Download button
  // that can only fail. The icon leads straight to checkout.
  if (!entLoading && price > 0 && !owned) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Link
          to="/checkout"
          search={{ item: "song", id: songId }}
          className={buttonClass}
          aria-label={`Buy ${title ?? "song"} for K${price.toFixed(0)}`}
          title={`Buy for K${price.toFixed(0)} to download it`}
        >
          <Download className={iconClass} />
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
          <Loader2 className={`${iconClass} animate-spin`} />
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
        title={label}
      >
        {progress !== null ? (
          <Loader2 className={`${iconClass} animate-spin`} />
        ) : (
          <Download className={iconClass} />
        )}
      </button>
      {error && <span className="text-[10px] text-destructive max-w-40 text-right">{error}</span>}
    </span>
  );
}
