import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ListMusic, ShoppingBag, Crown, Plus, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getMyOverview } from "@/lib/user.functions";
import { createPlaylist } from "@/lib/listener.functions";

/**
 * Mobile Library screen — subscription banner, playlists, recent purchases.
 *
 * Feature: wesu-plus-completion
 */
export function MobileLibrary() {
  const { user } = useAuth();
  const fetchOverview = useServerFn(getMyOverview);
  const createFn = useServerFn(createPlaylist);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const { data, refetch } = useQuery({
    queryKey: ["my-overview", user?.id],
    queryFn: () => fetchOverview(),
    enabled: !!user,
  });

  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      setShowCreate(false);
      setNewName("");
      refetch();
    },
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <ListMusic className="size-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Sign in to view your library</p>
      </div>
    );
  }

  const subscription = data?.subscription;
  const playlists = data?.playlists ?? [];
  const purchases = data?.recentPurchases ?? [];

  return (
    <div className="pb-6">
      {/* Subscription banner */}
      <div
        className={`mx-4 mt-4 mb-6 rounded-2xl p-4 flex items-center gap-3 ${
          subscription ? "bg-primary/10 border border-primary/20" : "bg-card border border-border"
        }`}
      >
        <Crown
          className={`size-6 shrink-0 ${subscription ? "text-primary" : "text-muted-foreground"}`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">
            {subscription ? subscription.plan : "Free Plan"}
          </p>
          <p className="text-xs text-muted-foreground">
            {subscription ? "Premium active" : "Upgrade for ad-free listening"}
          </p>
        </div>
        {!subscription && (
          <a
            href="/subscriptions"
            className="shrink-0 px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-bold min-h-[44px] flex items-center"
          >
            Upgrade
          </a>
        )}
      </div>

      {/* Playlists */}
      <div className="mb-6">
        <div className="flex items-center justify-between px-4 mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Playlists
          </h2>
          <button
            onClick={() => setShowCreate(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-primary"
            aria-label="Create playlist"
          >
            <Plus className="size-5" />
          </button>
        </div>

        {/* Create playlist form */}
        {showCreate && (
          <div className="mx-4 mb-3 bg-card border border-border rounded-xl p-4 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Playlist name"
              className="flex-1 min-h-[44px] px-3 rounded-lg bg-secondary border border-border text-sm focus:outline-none"
              aria-label="New playlist name"
            />
            <button
              disabled={!newName.trim() || createM.isPending}
              onClick={() => createM.mutate({ data: { name: newName.trim() } })}
              className="min-h-[44px] px-4 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewName("");
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground"
              aria-label="Cancel"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {playlists.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">No playlists yet.</p>
        ) : (
          playlists.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-2 min-h-[44px] hover:bg-white/5"
            >
              <div className="size-10 rounded-md bg-card flex items-center justify-center shrink-0">
                <ListMusic className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.is_public ? "Public" : "Private"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recent Purchases */}
      <div>
        <div className="flex items-center gap-2 px-4 mb-3">
          <ShoppingBag className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Recent Purchases
          </h2>
        </div>
        {purchases.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">No purchases yet.</p>
        ) : (
          purchases.slice(0, 10).map((p) => {
            const title =
              (p.song as { title?: string } | null)?.title ??
              (p.album as { title?: string } | null)?.title ??
              "Item";
            return (
              <div key={p.id} className="flex items-center justify-between px-4 py-2 min-h-[44px]">
                <p className="text-sm truncate flex-1">{title}</p>
                <span className="text-primary text-sm font-bold ml-4">
                  K{Number(p.amount).toFixed(2)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
