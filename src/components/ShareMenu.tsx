import { useState, useRef, useEffect } from "react";
import { MoreVertical, Heart, ListMusic, Plus, User, Share2, Disc, Copy, Check } from "lucide-react";
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
      toast.success(data.liked ? "❤️ Added to Liked Songs" : "💔 Removed from Liked Songs");
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  const addToPlaylistMutation = useMutation({
    mutationFn: addToPlaylistFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      setShowPlaylistModal(false);
      toast.success("✓ Added to playlist");
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
      toast.success("✓ Added to queue");
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
    toast.success("✓ Link copied to clipboard");
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
        className={`p-2 rounded-full hover:bg-accent transition-colors cursor-pointer ${className || ""}`}
        aria-label="More options"
      >
        <MoreVertical className="size-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {type === "song" && (
            <>
              <button
                onClick={() => {
                  if (songId) likeMutation.mutate({ data: { song_id: songId } });
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors cursor-pointer"
              >
                <Heart className={`size-4 ${isLiked ? "fill-primary text-primary" : ""}`} />
                {isLiked ? "Remove from Liked" : "Add to Liked"}
              </button>
              
              <button
                onClick={() => {
                  setShowPlaylistModal(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors cursor-pointer"
              >
                <ListMusic className="size-4" />
                Add to playlist
              </button>

              <button
                onClick={handleAddToQueue}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors cursor-pointer"
              >
                <Plus className="size-4" />
                Add to queue
              </button>

              {songArtists && songArtists.length > 0 && (
                <div className="border-t border-border">
                  <div className="px-4 py-2 text-xs text-muted-foreground font-medium">Go to artist</div>
                  {songArtists.map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => handleGoToArtist(a.id)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-accent transition-colors cursor-pointer pl-8"
                    >
                      <User className="size-4" />
                      {a.name}
                    </button>
                  ))}
                </div>
              )}

              {albumId && (
                <button
                  onClick={handleGoToAlbum}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors cursor-pointer border-t border-border"
                >
                  <Disc className="size-4" />
                  Go to album
                </button>
              )}
            </>
          )}

          <button
            onClick={handleCopyLink}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors cursor-pointer border-t border-border"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}

      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-4">Add to playlist</h3>
            
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {playlists?.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => handleAddToPlaylist(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors cursor-pointer text-left"
                >
                  <ListMusic className="size-4" />
                  {p.name}
                </button>
              ))}
            </div>

            <form onSubmit={handleCreatePlaylist} className="space-y-3">
              <input
                type="text"
                placeholder="New playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createPlaylistMutation.isPending || !newPlaylistName.trim()}
                  className="flex-1 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {createPlaylistMutation.isPending ? "Creating..." : "Create new"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlaylistModal(false)}
                  className="px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
