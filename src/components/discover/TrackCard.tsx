import { Link, useNavigate } from "@tanstack/react-router";
import { Play, Heart } from "lucide-react";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { useSavedAlbum } from "@/hooks/use-saved-album";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/stores/currency";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";
import { useServerFn } from "@tanstack/react-start";
import { getPreviewAudioUrl, getPublicAudioUrl } from "@/lib/listener.functions";
import { toast } from "sonner";

type Artist = { id: string; name: string } | null | undefined;

export interface TrackCardSong {
  id: string;
  title: string;
  cover_url: string | null;
  duration?: number | null;
  artist?: Artist;
  album_id?: string | null;
  price?: number | null;
}

/** Cover-first tile for New Music / Made For You style shelves. */
export function TrackCard({ song }: { song: TrackCardSong }) {
  const setTrack = usePlayer((s) => s.setTrack);
  const setIsPreview = usePlayer((s) => s.setIsPreview);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const artistName = song.artist?.name ?? "Unknown";
  const { user } = useAuth();
  const { isSaved, toggle } = useSavedTrack(song.id);
  const navigate = useNavigate();
  const getPreviewFn = useServerFn(getPreviewAudioUrl);
  const getPublicFn = useServerFn(getPublicAudioUrl);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      const currentPath = window.location.pathname + window.location.search;
      navigate({
        to: "/auth",
        search: { redirect: currentPath, action: "save", itemId: song.id, itemType: "song" }
      });
      return;
    }
    toggle();
  };

  const handlePlay = async () => {
    try {
      const isPaid = song.price && Number(song.price) > 0;
      
      if (isPaid) {
        // Use preview URL for paid songs
        const { url } = await getPreviewFn({ data: { song_id: song.id } });
        setTrack({
          id: song.id,
          title: song.title,
          artistName,
          coverUrl: song.cover_url,
          audioUrl: url,
          durationSeconds: song.duration ?? undefined,
        });
        setIsPreview(true);
        togglePlay();
        toast.info(`🎵 Previewing "${song.title}" (15s)`);
      } else {
        // Full playback for free songs
        const { url } = await getPublicFn({ data: { song_id: song.id } });
        setTrack({
          id: song.id,
          title: song.title,
          artistName,
          coverUrl: song.cover_url,
          audioUrl: url,
          durationSeconds: song.duration ?? undefined,
        });
        setIsPreview(false);
        togglePlay();
      }
    } catch (error) {
      toast.error(`Failed to play: ${(error as Error).message}`);
    }
  };

  return (
    <Link to="/songs/$id" params={{ id: song.id }} className="group text-left w-full relative cursor-pointer block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          handlePlay();
        }}
        className="relative block w-full cursor-pointer"
        aria-label={`Play ${song.title}`}
      >
        <StorageImage
          bucket="album-art"
          path={song.cover_url}
          alt={song.title}
          className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover transition-transform group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
          <div className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors">
            <Play className="size-4 fill-current ml-0.5" />
          </div>
        </div>
      </button>
      {user && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            handleSave();
          }}
          aria-label={isSaved ? "Unsave track" : "Save track"}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:scale-110 cursor-pointer"
          style={{ position: "absolute" }}
        >
          <Heart className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-white"}`} />
        </button>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{song.title}</p>
          {song.price != null && (
            <p className="text-xs font-medium text-primary">
              {useCurrency.getState().formatPrice(song.price)}
            </p>
          )}
          {song.artist?.id ? (
            <Link
              to="/artists/$id"
              params={{ id: song.artist.id }}
              className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline block cursor-pointer"
              onClick={(e) => e.preventDefault()}
            >
              {artistName}
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground truncate">{artistName}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 relative z-10">
          {user && Number(song.price ?? 0) <= 0 && (
            <DownloadButton songId={song.id} label="Download" />
          )}
          <ShareMenu
            songId={song.id}
            songTitle={song.title}
            artistId={song.artist?.id}
            artistName={artistName}
            albumId={song.album_id}
            type="song"
            icon="more"
            className="relative z-20"
          />
        </div>
      </div>
    </Link>
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
  const navigate = useNavigate();

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      const currentPath = window.location.pathname + window.location.search;
      navigate({
        to: "/auth",
        search: { redirect: currentPath, action: "save", itemId: album.id, itemType: "album" }
      });
      return;
    }
    toggle();
  };

  return (
    <div className="group text-left w-full relative cursor-pointer">
      <Link to="/albums/$id" params={{ id: album.id }} className="block cursor-pointer">
        <StorageImage
          bucket="album-art"
          path={album.cover_url}
          alt={album.title}
          className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover transition-transform group-hover:scale-[1.02]"
        />
        <p className="mt-2 text-sm font-semibold truncate group-hover:text-primary transition-colors">{album.title}</p>
      </Link>
      <div className="absolute top-2 right-2 flex gap-1">
        {user && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleSave(e);
            }}
            aria-label={isSaved ? "Unsave album" : "Save album"}
            className="p-1.5 rounded-full bg-black/50 backdrop-blur opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:scale-110 cursor-pointer"
          >
            <Heart className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-white"}`} />
          </button>
        )}
        <ShareMenu
          albumId={album.id}
          albumTitle={album.title}
          artistId={album.artist?.id}
          artistName={album.artist?.name}
          type="album"
          icon="more"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full bg-black/50 backdrop-blur hover:scale-110 cursor-pointer relative z-20"
        />
      </div>
      {album.artist?.id ? (
        <Link
          to="/artists/$id"
          params={{ id: album.artist.id }}
          className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline block cursor-pointer"
          onClick={(e) => e.preventDefault()}
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
    <div className="group text-center w-full relative cursor-pointer">
      <Link
        to="/artists/$id"
        params={{ id: artist.id }}
        className="block cursor-pointer"
      >
        <StorageImage
          bucket="artist-images"
          path={artist.avatar_url ?? null}
          alt={artist.name}
          className="aspect-square w-full rounded-full overflow-hidden bg-card ring-1 ring-white/5 object-cover transition-transform group-hover:scale-[1.02]"
        />
        <p className="mt-2 text-sm font-semibold truncate group-hover:text-primary transition-colors">{artist.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {artist.genre ?? "Artist"}
        </p>
      </Link>
      <div className="absolute top-2 right-2">
        <ShareMenu
          artistId={artist.id}
          artistName={artist.name}
          type="artist"
          icon="more"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full bg-black/50 backdrop-blur hover:scale-110 cursor-pointer relative z-20"
        />
      </div>
    </div>
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
      className={`relative aspect-[16/10] rounded-xl overflow-hidden bg-gradient-to-br ${gradient} p-4 flex items-start cursor-pointer hover:scale-[1.02] transition-transform`}
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
    <div className="group text-left w-full relative cursor-pointer">
      <Link
        to="/playlists/$id"
        params={{ id: playlist.id }}
        className="block cursor-pointer"
      >
        <StorageImage
          bucket="album-art"
          path={playlist.cover_url ?? null}
          alt={playlist.name}
          className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover transition-transform group-hover:scale-[1.02]"
        />
        <p className="mt-2 text-sm font-semibold truncate group-hover:text-primary transition-colors">{playlist.name}</p>
        {playlist.description ? (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {playlist.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Playlist</p>
        )}
      </Link>
      <div className="absolute top-2 right-2">
        <ShareMenu
          playlistId={playlist.id}
          playlistName={playlist.name}
          type="playlist"
          icon="more"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full bg-black/50 backdrop-blur hover:scale-110 cursor-pointer relative z-20"
        />
      </div>
    </div>
  );
}
