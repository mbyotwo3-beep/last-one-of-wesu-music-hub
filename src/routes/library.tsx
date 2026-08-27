import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Music, Users, Disc } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { StorageImage } from "@/components/StorageImage";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "My Library — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <LibraryRoute />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function LibraryRoute() {
  return <Page />;
}

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
        .eq("status", "completed")
        .is("album_id", null)
        .order("created_at", { ascending: false });
      return data?.map((item: any) => item.songs) ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: purchasedAlbums, isLoading: purchasedAlbumsLoading } = useQuery({
    queryKey: ["purchased-albums", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("purchases")
        .select("albums(*, artists(name))")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .not("album_id", "is", null)
        .order("created_at", { ascending: false });
      return data?.map((item: any) => item.albums) ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: followedArtists, isLoading: followingLoading } = useQuery({
    queryKey: ["followed-artists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("artist_followers")
        .select("artists(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data?.map((item: any) => item.artists) ?? [];
    },
    enabled: !!user?.id,
  });

  if (likedLoading || purchasedLoading || purchasedAlbumsLoading || followingLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold mb-6">My Library</h1>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Users className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Followed Artists</h2>
        </div>
        {!followedArtists || followedArtists.length === 0 ? (
          <p className="text-muted-foreground">No followed artists yet. Follow artists to see them here.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {followedArtists.map((artist: any) => (
              <Link
                key={artist.id}
                to="/artists/$id"
                params={{ id: artist.id }}
                className="group text-center p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-border cursor-pointer"
              >
                <StorageImage
                  bucket="artist-images"
                  path={artist.avatar_url}
                  alt={artist.name}
                  className="aspect-square w-full rounded-full overflow-hidden bg-card ring-1 ring-white/5 mb-3 object-cover"
                />
                <p className="font-semibold text-sm truncate">{artist.name}</p>
                <p className="text-xs text-muted-foreground">Artist</p>
              </Link>
            ))}
          </div>
        )}
      </section>

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
                <StorageImage
                  bucket="album-art"
                  path={song.cover_url}
                  alt={song.title}
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
          <h2 className="text-xl font-semibold">Purchased Singles</h2>
        </div>
        {!purchasedSongs || purchasedSongs.length === 0 ? (
          <p className="text-muted-foreground">No purchased singles yet.</p>
        ) : (
          <div className="space-y-2">
            {purchasedSongs.map((song: any) => (
              <div
                key={song.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
              >
                <StorageImage
                  bucket="album-art"
                  path={song.cover_url}
                  alt={song.title}
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

      <section className="mt-10">
        <div className="flex items-center gap-2 mb-4">
          <Disc className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Purchased Albums</h2>
        </div>
        {!purchasedAlbums || purchasedAlbums.length === 0 ? (
          <p className="text-muted-foreground">No purchased albums yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {purchasedAlbums.map((album: any) => (
              <Link
                key={album.id}
                to="/albums/$id"
                params={{ id: album.id }}
                className="group text-center p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-border cursor-pointer"
              >
                <StorageImage
                  bucket="album-art"
                  path={album.cover_url}
                  alt={album.title}
                  className="aspect-square w-full rounded-lg overflow-hidden bg-card ring-1 ring-white/5 mb-3 object-cover"
                />
                <p className="font-semibold text-sm truncate">{album.title}</p>
                <p className="text-xs text-muted-foreground truncate">{album.artists?.name ?? "Unknown"}</p>
                <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-full mt-2 inline-block">
                  Owned
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
