import { Link } from "@tanstack/react-router";
import { Play, Heart } from "lucide-react";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { useSavedAlbum } from "@/hooks/use-saved-album";
import { useAuth } from "@/hooks/use-auth";

type Artist = { id: string; name: string } | null | undefined;

export interface TrackCardSong {
  id: string;
  title: string;
  cover_url: string | null;
  duration?: number | null;
  artist?: Artist;
  price?: number | null;
}

/** Cover-first tile for New Music / Made For You style shelves. */
export function TrackCard({ song }: { song: TrackCardSong }) {
  const setTrack = usePlayer((s) => s.setTrack);
  const artistName = song.artist?.name ?? "Unknown";
  const { user } = useAuth();
  const { isSaved, toggle } = useSavedTrack(song.id);
  return (
    <div className="group text-left w-full relative">
      <button
        type="button"
        onClick={() =>
          setTrack({
            id: song.id,
            title: song.title,
            artistName,
            coverUrl: song.cover_url,
            durationSeconds: song.duration ?? undefined,
          })
        }
        className="relative block w-full"
        aria-label={`Play ${song.title}`}
      >
        <StorageImage
          bucket="album-art"
          path={song.cover_url}
          alt={song.title}
          className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover"
        />
        <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
          <div className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
            <Play className="size-4 fill-current ml-0.5" />
          </div>
        </div>
      </button>
      {user && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-label={isSaved ? "Unsave track" : "Save track"}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:scale-110"
          style={{ position: "absolute" }}
        >
          <Heart className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-white"}`} />
        </button>
      )}
      <p className="mt-2 text-sm font-semibold truncate">{song.title}</p>
      {song.price != null && (
        <p className="text-xs font-medium text-primary">
          {song.price > 0 ? `ZMW ${song.price.toFixed(2)}` : 'Free'}
        </p>
      )}
      {song.artist?.id ? (
        <Link
          to="/artists/$id"
          params={{ id: song.artist.id }}
          className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline block"
        >
          {artistName}
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground truncate">{artistName}</p>
      )}
    </div>
  );
}

export interface AlbumTileData {
  id: string;
  title: string;
  cover_url: string | null;
  artist?: Artist;
}

export function AlbumTile({ album }: { album: AlbumTileData }) {
  const { user } = useAuth();
  const { isSaved, toggle } = useSavedAlbum(album.id);
  return (
    <div className="group text-left w-full relative">
      <Link to="/albums/$id" params={{ id: album.id }} className="block">
        <StorageImage
          bucket="album-art"
          path={album.cover_url}
          alt={album.title}
          className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover transition-transform group-hover:scale-[1.02]"
        />
        <p className="mt-2 text-sm font-semibold truncate">{album.title}</p>
      </Link>
      {user && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
          aria-label={isSaved ? "Unsave album" : "Save album"}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:scale-110"
        >
          <Heart className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-white"}`} />
        </button>
      )}
      {album.artist?.id ? (
        <Link
          to="/artists/$id"
          params={{ id: album.artist.id }}
          className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline block"
        >
          {album.artist.name}
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground truncate">Various</p>
      )}
    </div>
  );
}

export interface ArtistTileData {
  id: string;
  name: string;
  avatar_url?: string | null;
  genre?: string | null;
  verified?: boolean | null;
}

export function ArtistTile({ artist }: { artist: ArtistTileData }) {
  return (
    <Link
      to="/artists/$id"
      params={{ id: artist.id }}
      className="group text-center w-full block"
    >
      <StorageImage
        bucket="artist-images"
        path={artist.avatar_url ?? null}
        alt={artist.name}
        className="aspect-square w-full rounded-full overflow-hidden bg-card ring-1 ring-white/5 object-cover transition-transform group-hover:scale-[1.02]"
      />
      <p className="mt-2 text-sm font-semibold truncate">{artist.name}</p>
      <p className="text-xs text-muted-foreground truncate">
        {artist.genre ?? "Artist"}
      </p>
    </Link>
  );
}

const GENRE_GRADIENTS: Record<string, string> = {
  default: "from-fuchsia-600 to-indigo-700",
};
const PALETTE = [
  "from-rose-500 to-orange-600",
  "from-amber-500 to-red-600",
  "from-emerald-500 to-teal-700",
  "from-sky-500 to-indigo-700",
  "from-fuchsia-600 to-purple-800",
  "from-lime-500 to-emerald-700",
  "from-cyan-500 to-blue-700",
  "from-pink-500 to-fuchsia-700",
];

export function GenreTile({ genre, index }: { genre: string; index: number }) {
  const gradient =
    GENRE_GRADIENTS[genre.toLowerCase()] ?? PALETTE[index % PALETTE.length];
  return (
    <Link
      to="/browse"
      search={{ genre } as never}
      className={`relative aspect-[16/10] rounded-xl overflow-hidden bg-gradient-to-br ${gradient} p-4 flex items-start`}
    >
      <span className="text-white text-lg font-bold tracking-tight drop-shadow">
        {genre}
      </span>
    </Link>
  );
}

export interface PlaylistTileData {
  id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
}

export function PlaylistTile({ playlist }: { playlist: PlaylistTileData }) {
  return (
    <Link
      to="/playlists/$id"
      params={{ id: playlist.id }}
      className="group text-left w-full block"
    >
      <StorageImage
        bucket="album-art"
        path={playlist.cover_url ?? null}
        alt={playlist.name}
        className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover transition-transform group-hover:scale-[1.02]"
      />
      <p className="mt-2 text-sm font-semibold truncate">{playlist.name}</p>
      {playlist.description ? (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {playlist.description}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Playlist</p>
      )}
    </Link>
  );
}