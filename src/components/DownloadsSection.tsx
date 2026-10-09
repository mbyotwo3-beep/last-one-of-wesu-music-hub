import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { useOfflineMode } from "@/stores/offline-mode";
import {
  getVaultArtObjectUrl,
  getVaultUsage,
  isVaultSupported,
  listVaultMeta,
  removeTrackFromVault,
} from "@/lib/offline-vault";

/**
 * Cover that prefers vault art bytes (works with zero bars) and falls back
 * to the regular cover component when the row predates artwork storage.
 */
function VaultCover({ songId, path, alt }: { songId: string; path: string | null; alt: string }) {
  const [artUrl, setArtUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setArtUrl(null);
    getVaultArtObjectUrl(songId)
      .then((url) => {
        if (!cancelled) setArtUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [songId]);
  if (artUrl) {
    return (
      <img
        src={artUrl}
        alt={alt}
        className="size-11 rounded-md object-cover bg-secondary shrink-0"
      />
    );
  }
  return (
    <StorageImage
      bucket="album-art"
      path={path}
      alt={alt}
      className="size-11 rounded-md overflow-hidden bg-secondary shrink-0 object-cover"
    />
  );
}

/**
 * Offline downloads living in the encrypted on-device vault. Fully usable
 * with zero connectivity (metadata + audio + covers are all local) — this
 * is the "offline mode" destination the player links to when streaming is
 * unavailable.
 */
export function DownloadsSection() {
  const qc = useQueryClient();
  const setQueue = usePlayer((s) => s.setQueue);
  const { enabled: offlineModeEnabled, setEnabled: setOfflineMode, hydrate } = useOfflineMode();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Hooks must run before the mounted/vault gate below — this file already had a
  // hydration bug from getting that wrong, so the effect belongs here with the
  // others.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const { data: tracks } = useQuery({
    // Prefix-matched by touchVaultQueries(["vault-track"]) so every
    // download/remove anywhere refreshes this list.
    queryKey: ["vault-track", "meta-list"],
    queryFn: () => listVaultMeta(),
    staleTime: 30_000,
  });
  const { data: usage } = useQuery({
    queryKey: ["vault-track", "usage"],
    queryFn: () => getVaultUsage(),
    staleTime: 30_000,
  });

  // IndexedDB only exists in the browser, so the old `if (!isVaultSupported())
  // return null` AFTER the hooks made SSR render nothing and the client's first
  // paint render the whole section — a hydration mismatch plus a flash of an
  // empty downloads page. Gate on "mounted" instead, so both sides render the
  // same thing first.
  if (!mounted || !isVaultSupported()) return null;
  const list = tracks ?? [];
  const mb = ((usage?.bytes ?? 0) / 1048576).toFixed(1);

  const playAll = () => {
    if (list.length === 0) return;
    setQueue(
      list.map((t) => ({
        id: t.songId,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
      })),
      0,
    );
  };

  const remove = async (songId: string, title: string) => {
    try {
      await removeTrackFromVault(songId);
      await qc.invalidateQueries({ queryKey: ["vault-track"] });
      toast.success(`Removed "${title}" from this device`);
    } catch {
      toast.error("Could not remove this download");
    }
  };

  return (
    <section id="downloads" className="mb-10 scroll-mt-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Download className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Downloads on this device</h2>
        </div>
        {list.length > 0 && (
          <button
            type="button"
            onClick={playAll}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
          >
            <Play className="size-4 fill-current" /> Play all
          </button>
        )}
      </div>

      {/* The Offline mode switch lives here because this is where a listener goes
          to manage the device. Spotify keeps it in Settings; on a phone with no
          settings page, the downloads list is the honest home for it. */}
      <label className="mb-3 flex items-start gap-3 rounded-xl border border-border bg-card p-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={offlineModeEnabled}
          onChange={(e) => setOfflineMode(e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-semibold text-foreground">Offline mode</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            Play only these {list.length} download{list.length === 1 ? "" : "s"}, even with full
            bars. Stays on until you turn it off, including after the app is closed.
          </span>
        </span>
      </label>
      {list.length === 0 ? (
        <p className="text-muted-foreground">
          No downloads yet — tap the download icon on any bought or free song and it plays here with
          no internet.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            {list.length} song{list.length === 1 ? "" : "s"} · {mb} MB · encrypted, plays only in
            Wesu+
          </p>
          <div className="space-y-2">
            {list.map((t) => (
              <div
                key={t.songId}
                className="flex items-center gap-3 p-2 rounded-xl bg-card border border-border"
              >
                <button
                  type="button"
                  onClick={() =>
                    setQueue(
                      [
                        {
                          id: t.songId,
                          title: t.title,
                          artistName: t.artistName,
                          coverUrl: t.coverUrl,
                        },
                      ],
                      0,
                    )
                  }
                  className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                  aria-label={`Play ${t.title} offline`}
                >
                  <VaultCover songId={t.songId} path={t.coverUrl} alt={t.title} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.artistName}</p>
                  </div>
                  <Play className="size-4 text-muted-foreground shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.songId, t.title)}
                  className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  aria-label={`Remove ${t.title} from this device`}
                  title="Remove from this device"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
