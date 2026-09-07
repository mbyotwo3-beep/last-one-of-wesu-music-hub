import { useState, useRef, useEffect } from "react";
import { MoreVertical, Heart, ListMusic, Plus, User, Share2, Disc, Copy, Check, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { usePlayer } from "@/stores/player";
import { toast } from "sonner";
import { toggleLike, addToPlaylist, createPlaylist } from "@/lib/listener.functions";
import { getSongArtists } from "@/lib/music.functions";

interface ShareMenuProps {
  songId?: string;
  songTitle?: string;
  albumId?: string;
  albumTitle?: string;
  artistId?: string;
  artistName?: string;
  playlistId?: string;
  playlistName?: string;
  type: "song" | "album" | "artist" | "playlist";
}

export function ShareMenu({ songId, songTitle, albumId, albumTitle, artistId, artistName, playlistId, playlistName, type, className }: ShareMenuProps & { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const qc = useQueryClient();
  const toggleLikeFn = useServerFn(toggleLike);
  const addToPlaylistFn = useServerFn(addToPlaylist);
  const createPlaylistFn = useServerFn(createPlaylist);
  const getSongArtistsFn = useServerFn(getSongArtists);
  const addToQueue = usePlayer((s) => s.setQueue);
  const setTrack = usePlayer((s) => s.setTrack);

  const { data: isLiked } = useQuery({
    queryKey: ["song-like", songId, user?.id],
    queryFn: async () => {
      if (!songId || !user?.id) return false;
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("song_likes")
        .select("song_id")
        .eq("song_id", songId)
        .eq("user_id", user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!songId && !!user?.id,
  });

  const { data: playlists } = useQuery({
    queryKey: ["my-playlists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("playlists")
        .select("id, name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: songArtists } = useQuery({
    queryKey: ["song-artists", songId],
    queryFn: () => getSongArtistsFn({ data: { song_id: songId! } }),
    enabled: !!songId && type === "song",
  });

  const likeMutation = useMutation({
    mutationFn: toggleLikeFn,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["song-like", songId, user?.id] });
      toast.success(data.liked ? "Added to Liked Songs" : "Removed from Liked Songs");
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  const addToPlaylistMutation = useMutation({
    mutationFn: addToPlaylistFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      setShowPlaylistModal(false);
      toast.success("Added to playlist");
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  const createPlaylistMutation = useMutation({
    mutationFn: createPlaylistFn,
    onSuccess: (data) => {
      if (songId) {
        addToPlaylistMutation.mutate({ data: { playlist_id: data.id, song_id: songId } });
      }
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  const handleAddToPlaylist = (playlistId: string) => {
    if (songId) {
      addToPlaylistMutation.mutate({ data: { playlist_id: playlistId, song_id: songId } });
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    createPlaylistMutation.mutate({ data: { name: newPlaylistName, description: "", make_public: false } });
  };

  const handleAddToQueue = () => {
    if (songId && songTitle) {
      const currentQueue = usePlayer.getState().queue;
      const currentTrack = usePlayer.getState().track;
      const newTrack = {
        id: songId,
        title: songTitle,
        artistName: artistName || "Unknown",
        coverUrl: undefined,
      };
      addToQueue([...currentQueue, newTrack], currentQueue.length);
      toast.success("Added to queue");
    }
  };

  const handleCopyLink = () => {
    let url = window.location.origin;
    if (type === "song" && songId) url += `/songs/${songId}`;
    else if (type === "album" && albumId) url += `/albums/${albumId}`;
    else if (type === "artist" && artistId) url += `/artists/${artistId}`;
    else if (type === "playlist" && playlistId) url += `/playlists/${playlistId}`;
    
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGoToArtist = (artistId: string) => {
    window.location.href = `/artists/${artistId}`;
  };

  const handleGoToAlbum = () => {
    if (albumId) {
      window.location.href = `/albums/${albumId}`;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer ${className || ""}`}
        aria-label="More options"
      >
        <MoreVertical className="size-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-card rounded-lg shadow-2xl z-[100] overflow-hidden border border-border">
          {type === "song" && (
            <>
              <button
                onClick={() => {
                  if (songId) likeMutation.mutate({ data: { song_id: songId } });
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
              >
                <Heart className={`size-4 ${isLiked ? "fill-primary text-primary" : ""}`} />
                {isLiked ? "Remove from Liked Songs" : "Add to Liked Songs"}
              </button>
              
              <button
                onClick={() => {
                  setShowPlaylistModal(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
              >
                <ListMusic className="size-4" />
                Add to playlist
              </button>

              <button
                onClick={handleAddToQueue}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
              >
                <Plus className="size-4" />
                Add to queue
              </button>

              <div className="border-t border-border" />

              {songArtists && songArtists.length > 0 && (
                <>
                  {songArtists.map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => handleGoToArtist(a.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
                    >
                      <User className="size-4" />
                      Go to artist
                    </button>
                  ))}
                  <div className="border-t border-border" />
                </>
              )}

              {albumId && (
                <button
                  onClick={handleGoToAlbum}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
                >
                  <Disc className="size-4" />
                  Go to album
                </button>
              )}
            </>
          )}

          <button
            onClick={handleCopyLink}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left border-t border-border"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            {copied ? "Link copied" : "Copy song link"}
          </button>
        </div>
      )}

      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground text-lg">Add to playlist</h3>
              <button
                onClick={() => setShowPlaylistModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
            
            <div className="space-y-1 mb-4 max-h-60 overflow-y-auto">
              {playlists?.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => handleAddToPlaylist(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-md hover:bg-accent transition-colors cursor-pointer text-left"
                >
                  <ListMusic className="size-4 text-muted-foreground" />
                  <span className="text-foreground">{p.name}</span>
                </button>
              ))}
            </div>

            <div className="border-t border-border pt-4">
              <form onSubmit={handleCreatePlaylist} className="space-y-3">
                <input
                  type="text"
                  placeholder="New playlist name"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="w-full px-4 py-3 rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={createPlaylistMutation.isPending || !newPlaylistName.trim()}
                    className="flex-1 px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform cursor-pointer"
                  >
                    {createPlaylistMutation.isPending ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPlaylistModal(false)}
                    className="px-6 py-3 rounded-full bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-accent transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
