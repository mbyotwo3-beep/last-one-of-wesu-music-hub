import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StorageImage } from "@/components/StorageImage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePlayer } from "@/stores/player";
import { useOfflineMode } from "@/stores/offline-mode";
import {
  getVaultArtObjectUrl,
  getVaultUsage,
  isVaultSupported,
  listVaultMeta,
  refreshVaultIdCache,
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
 * Downloaded songs living in the encrypted on-device vault. Fully usable
 * with zero connectivity (metadata + audio + covers are all local) — the
 * plain list the player links to when streaming is unavailable, mounted on
 * /downloads and at the top of the library.
 */
export function DownloadsSection() {
  const qc = useQueryClient();
  const setQueue = usePlayer((s) => s.setQueue);
  const { hydrate } = useOfflineMode();
  const [mounted, setMounted] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ songId: string; title: string } | null>(
    null,
  );
  useEffect(() => setMounted(true), []);
  // Hooks must run before the mounted/vault gate below — this file already had a
  // hydration bug from getting that wrong, so the effect belongs here with the
  // others.
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  // The player consults this index synchronously and refuses to queue anything
  // missing from it. Reading it here means a listener who lands on /downloads
  // first, then taps a track, is filtered correctly on the very first tap.
  useEffect(() => {
    if (mounted) void refreshVaultIdCache();
  }, [mounted]);

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
  //
  // Note the second half of that condition changed too. Returning null when the
  // vault is unsupported made the whole page EMPTY — indistinguishable from
  // "you have no downloads". That is the worst possible answer when someone is
  // trying to work out why their downloads are not being kept: the failure
  // looks exactly like the absence of a feature. It now says what is wrong.
  if (!mounted) return null;

  if (!isVaultSupported()) {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Downloaded</h2>
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-foreground font-medium">
            This phone can&apos;t store downloads
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Wesu+ keeps downloads in private storage on this device. Android is blocking it, so
            songs cannot be saved here. Music still streams normally whenever you have internet.
          </p>
        </div>
      </section>
    );
  }

  // Same lenient-array guard as the library lists: listVaultMeta resolving a
  // non-array (corrupted snapshot, future envelope) must not crash the page.
  const list = Array.isArray(tracks) ? tracks : [];
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
          <h2 className="text-xl font-semibold">Downloaded</h2>
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

      {/* No switch here any more. Offline is implicit now — the app filters to
          downloads by itself whenever the connection is gone, the way YouTube
          and Spotify do, so there is nothing for the listener to turn on, keep
          track of, or forget to turn off. This page stays honest about what IS
          on the device, which is the part that remains their business. */}
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
                  onClick={() => setPendingRemoval({ songId: t.songId, title: t.title })}
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

      <AlertDialog
        open={!!pendingRemoval}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this download?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingRemoval?.title}&rdquo; will no longer play without internet. You can
              download it again whenever you want, but it will use your data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={() => {
                const target = pendingRemoval;
                setPendingRemoval(null);
                if (target) void remove(target.songId, target.title);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
