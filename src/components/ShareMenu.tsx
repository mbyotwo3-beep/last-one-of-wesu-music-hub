import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { MoreVertical, Heart, ListMusic, Plus, User, Share2, Disc, Copy, Check, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { usePlayer } from "@/stores/player";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { toast } from "sonner";
import { addToPlaylist, createPlaylist } from "@/lib/listener.functions";
import { getSongArtists } from "@/lib/music.functions";
import { supabase } from "@/integrations/supabase/client";

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
  icon?: "more" | "share";
}

export function ShareMenu({ songId, songTitle, albumId, albumTitle, artistId, artistName, playlistId, playlistName, type, className, icon = "more" }: ShareMenuProps & { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [copied, setCopied] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isPositioned, setIsPositioned] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const addToPlaylistFn = useServerFn(addToPlaylist);
  const createPlaylistFn = useServerFn(createPlaylist);
  const getSongArtistsFn = useServerFn(getSongArtists);
  const addToQueue = usePlayer((s) => s.setQueue);
  const setTrack = usePlayer((s) => s.setTrack);
  const { isSaved, toggle } = useSavedTrack(songId);

  const { data: playlists } = useQuery({
    queryKey: ["my-playlists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
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

  const handleLike = () => {
    if (!user) {
      const currentPath = window.location.pathname + window.location.search;
      navigate({
        to: "/auth",
        search: { redirect: currentPath, action: "like", itemId: songId, itemType: "song" }
      });
      setIsOpen(false);
      return;
    }
    toggle();
  };

  const handleAddToPlaylistClick = () => {
    if (!user) {
      const currentPath = window.location.pathname + window.location.search;
      navigate({
        to: "/auth",
        search: { redirect: currentPath, action: "addPlaylist", itemId: songId, itemType: "song" }
      });
      setIsOpen(false);
      return;
    }
    setShowPlaylistModal(true);
    setIsOpen(false);
  };

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

  const handleToggle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      
      // Calculate position like Spotify - align to right of button, but ensure it doesn't go off-screen
      const menuWidth = 208; // w-52 = 13rem = 208px
      const menuHeight = 300; // Approximate menu height
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let leftPosition;
      // Try to align to right of button
      if (rect.right + menuWidth <= viewportWidth) {
        leftPosition = rect.right;
      } else if (rect.left >= menuWidth) {
        // Not enough space on right, align to left of button
        leftPosition = rect.left - menuWidth;
      } else {
        // Not enough space on either side, align to right edge with padding
        leftPosition = viewportWidth - menuWidth - 8;
      }
      
      let topPosition;
      // Try to position below button
      if (rect.bottom + menuHeight <= viewportHeight) {
        topPosition = rect.bottom + 4;
      } else if (rect.top >= menuHeight) {
        // Not enough space below, position above button
        topPosition = rect.top - menuHeight - 4;
      } else {
        // Not enough space on either side, position at bottom with padding
        topPosition = viewportHeight - menuHeight - 8;
      }
      
      setMenuPosition({
        top: topPosition,
        left: leftPosition,
      });
      setIsPositioned(true);
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setIsPositioned(false);
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
    setIsOpen(false);
  };

  const handleGoToArtist = (artistId: string) => {
    navigate({ to: "/artists/$id", params: { id: artistId } });
    setIsOpen(false);
  };

  const handleGoToAlbum = () => {
    if (albumId) {
      navigate({ to: "/albums/$id", params: { id: albumId } });
      setIsOpen(false);
    }
  };

  const handleFollow = () => {
    // For artist type, add follow option
    setIsOpen(false);
    // This would need to be implemented with actual follow logic
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Close if click is outside both the button and the menu
      if (
        buttonRef.current && 
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggle();
        }}
        className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer ${className || ""}`}
        aria-label={icon === "share" ? "Share" : "More options"}
      >
        {icon === "share" ? <Share2 className="size-5" /> : <MoreVertical className="size-5" />}
      </button>

      {isOpen && isPositioned && createPortal(
        <div 
          ref={menuRef}
          className="fixed w-52 bg-card rounded-lg shadow-2xl z-[99999] overflow-hidden border border-border"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          {type === "song" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLike();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
              >
                <Heart className={`size-4 ${isSaved ? "fill-primary text-primary" : ""}`} />
                {isSaved ? "Remove from Liked Songs" : "Add to Liked Songs"}
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToPlaylistClick();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
              >
                <ListMusic className="size-4" />
                Add to playlist
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToQueue();
                }}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGoToArtist(a.id);
                      }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGoToAlbum();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
                >
                  <Disc className="size-4" />
                  Go to album
                </button>
              )}
            </>
          )}

          {type === "artist" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyLink();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
              >
                <Share2 className="size-4" />
                Share artist
              </button>
              <div className="border-t border-border" />
            </>
          )}

          {type === "album" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyLink();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
              >
                <Share2 className="size-4" />
                Share album
              </button>
              <div className="border-t border-border" />
            </>
          )}

          {type === "playlist" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyLink();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left"
              >
                <Share2 className="size-4" />
                Share playlist
              </button>
              <div className="border-t border-border" />
            </>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyLink();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer text-left border-t border-border"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            {copied ? "Link copied" : `Copy ${type} link`}
          </button>
        </div>,
        document.body
      )}

      {showPlaylistModal && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
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
        </div>,
        document.body
      )}
    </>
  );
}
