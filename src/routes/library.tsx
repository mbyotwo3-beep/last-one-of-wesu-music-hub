import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Music } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "My Library — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function Page() {
  const { user } = useAuth();

  const { data: likedSongs, isLoading: likedLoading } = useQuery({
    queryKey: ["liked-songs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("song_likes")
        .select("songs(*, artists(name))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data?.map((item: any) => item.songs) ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: purchasedSongs, isLoading: purchasedLoading } = useQuery({
    queryKey: ["purchased-songs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("purchases")
        .select("songs(*, artists(name))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data?.map((item: any) => item.songs) ?? [];
    },
    enabled: !!user?.id,
  });

  if (likedLoading || purchasedLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">My Library</h1>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Heart className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Liked Songs</h2>
        </div>
        {!likedSongs || likedSongs.length === 0 ? (
          <p className="text-muted-foreground">No liked songs yet.</p>
        ) : (
          <div className="space-y-2">
            {likedSongs.map((song: any) => (
              <div
                key={song.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
              >
                <img
                  src={song.cover_url ?? "/images/wesu-mark.png"}
                  alt=""
                  className="size-12 rounded object-cover bg-muted"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{song.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{song.artists?.name ?? "Unknown"}</p>
                </div>
                {song.price && Number(song.price) > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    ZMW {Number(song.price).toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Music className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Purchased Songs</h2>
        </div>
        {!purchasedSongs || purchasedSongs.length === 0 ? (
          <p className="text-muted-foreground">No purchased songs yet.</p>
        ) : (
          <div className="space-y-2">
            {purchasedSongs.map((song: any) => (
              <div
                key={song.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
              >
                <img
                  src={song.cover_url ?? "/images/wesu-mark.png"}
                  alt=""
                  className="size-12 rounded object-cover bg-muted"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{song.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{song.artists?.name ?? "Unknown"}</p>
                </div>
                <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-full">
                  Owned
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
