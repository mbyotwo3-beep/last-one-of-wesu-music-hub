import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Check, Loader2, User, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/use-auth";
import { getMyArtistProfile } from "@/lib/user.functions";
import { updateArtistProfile } from "@/lib/artist.functions";
import { uploadFileToBucket } from "@/lib/storage";
import { RoleGate } from "@/components/RoleGate";
import { toast } from "sonner";

export const Route = createFileRoute("/artist-profile-edit")({
  head: () => ({
    meta: [{ title: "Edit Profile — Wesu+" }],
  }),
  component: () => (
    <RoleGate require="artist">
      <ArtistProfileEditPage />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function ArtistProfileEditPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const fetchProfile = useServerFn(getMyArtistProfile);
  const updateProfile = useServerFn(updateArtistProfile);

  const { data: artist, isLoading } = useQuery({
    queryKey: ["my-artist-profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
    retry: 1,
  });

  const [formData, setFormData] = useState({
    name: "",
    bio: "",
    genre: "",
    social_links: {
      instagram: "",
      twitter: "",
      facebook: "",
      youtube: "",
      spotify: "",
      apple_music: "",
    },
  });

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when artist data loads
  useEffect(() => {
    if (artist && !isInitialized) {
      setFormData({
        name: artist.name || "",
        bio: artist.bio || "",
        genre: artist.genre || "",
        social_links: {
          instagram: (artist.social_links as any)?.instagram || "",
          twitter: (artist.social_links as any)?.twitter || "",
          facebook: (artist.social_links as any)?.facebook || "",
          youtube: (artist.social_links as any)?.youtube || "",
          spotify: (artist.social_links as any)?.spotify || "",
          apple_music: (artist.social_links as any)?.apple_music || "",
        },
      });
      if (artist.avatar_url) setAvatarPreview(artist.avatar_url);
      if (artist.cover_url) setCoverPreview(artist.cover_url);
      setIsInitialized(true);
    }
  }, [artist, isInitialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !artist) throw new Error("Not authenticated or no artist profile");

      let avatarUrl = artist.avatar_url;
      let coverUrl = artist.cover_url;

      try {
        // Upload avatar if changed
        if (avatarFile) {
          console.log("[Artist Profile] Uploading avatar...", {
            bucket: "artist-images",
            artistId: artist.id,
            fileName: avatarFile.name,
            fileSize: avatarFile.size,
            fileType: avatarFile.type
          });
          const uploadStart = Date.now();
          // CRITICAL: Use artist.id for artist-images bucket (RLS policy requires artist_id as folder)
          avatarUrl = await uploadFileToBucket("artist-images", artist.id, avatarFile);
          console.log("[Artist Profile] Avatar uploaded successfully:", {
            path: avatarUrl,
            duration: Date.now() - uploadStart
          });
        }

        // Upload cover if changed
        if (coverFile) {
          console.log("[Artist Profile] Uploading cover...", {
            bucket: "artist-images",
            artistId: artist.id,
            fileName: coverFile.name,
            fileSize: coverFile.size,
            fileType: coverFile.type
          });
          const uploadStart = Date.now();
          // CRITICAL: Use artist.id for artist-images bucket (RLS policy requires artist_id as folder)
          coverUrl = await uploadFileToBucket("artist-images", artist.id, coverFile);
          console.log("[Artist Profile] Cover uploaded successfully:", {
            path: coverUrl,
            duration: Date.now() - uploadStart
          });
        }

        // Update profile
        const profileData = {
          name: formData.name,
          bio: formData.bio,
          genre: formData.genre,
          avatar_url: avatarUrl,
          cover_url: coverUrl,
          social_links: formData.social_links,
        };
        
        console.log("[Artist Profile] Updating profile with data:", profileData);
        const updateStart = Date.now();
        
        const result = await updateProfile(profileData);
        
        console.log("[Artist Profile] Profile update completed:", {
          result,
          duration: Date.now() - updateStart
        });
        
        return result;
      } catch (error) {
        console.error("[Artist Profile] Error in saveMutation:", {
          error,
          errorMessage: (error as Error).message,
          errorStack: (error as Error).stack,
          userId: user.id,
          hasAvatarFile: !!avatarFile,
          hasCoverFile: !!coverFile
        });
        throw error;
      }
    },
    onSuccess: () => {
      console.log("[Artist Profile] Save successful, invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["my-artist-profile"] });
      queryClient.invalidateQueries({ queryKey: ["artist-overview"] });
      toast.success("Profile updated successfully!");
      navigate({ to: "/artist-dashboard" });
    },
    onError: (error) => {
      console.error("[Artist Profile] Save failed:", error);
      const errorMsg = (error as Error).message;
      toast.error(`Failed to update profile: ${errorMsg}`, {
        description: "Check the browser console (F12) for detailed error information.",
        duration: 5000
      });
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be less than 10MB");
      return;
    }

    setCoverFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setCoverPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  if (loading || !user) return null;
  if (isLoading) return <div className="p-12 text-center">Loading...</div>;
  if (!artist) return <div className="p-12 text-center">Artist profile not found</div>;

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Edit Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Customize your artist profile
            </p>
          </div>
          <button
            onClick={() => navigate({ to: "/artist-dashboard" })}
            className="p-2 hover:bg-accent rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-8"
        >
          {/* Cover Photo */}
          <div>
            <label className="block text-sm font-medium mb-3">Cover Photo</label>
            <div
              className="relative h-48 md:h-64 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl overflow-hidden cursor-pointer group"
              onClick={() => coverInputRef.current?.click()}
            >
              {coverPreview ? (
                <img
                  src={coverPreview}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Camera className="size-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to upload cover</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="text-center">
                  <Camera className="size-8 mx-auto mb-2 text-white" />
                  <p className="text-sm text-white">Change cover photo</p>
                </div>
              </div>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Recommended: 1500x500px, max 10MB
            </p>
          </div>

          {/* Profile Picture */}
          <div>
            <label className="block text-sm font-medium mb-3">Profile Picture</label>
            <div className="flex items-center gap-6">
              <div
                className="relative w-32 h-32 rounded-full overflow-hidden cursor-pointer group bg-gradient-to-br from-primary/20 to-primary/5"
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <User className="size-12 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="size-6 text-white" />
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/80 text-sm font-medium transition-colors"
                >
                  Change photo
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  Recommended: 400x400px, max 5MB
                </p>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          {/* Artist Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Artist Name *
            </label>
            <input
              id="name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-card border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
              placeholder="Your artist name"
            />
          </div>

          {/* Genre */}
          <div>
            <label htmlFor="genre" className="block text-sm font-medium mb-2">
              Genre
            </label>
            <input
              id="genre"
              type="text"
              value={formData.genre}
              onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-card border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
              placeholder="e.g., Hip Hop, Afrobeat, R&B"
            />
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium mb-2">
              Bio
            </label>
            <textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-card border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors resize-none"
              placeholder="Tell your fans about yourself..."
            />
            <p className="text-xs text-muted-foreground mt-2">
              {formData.bio.length} / 500 characters
            </p>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Social Links</h3>
            <div className="space-y-4">
              {[
                { key: "instagram", label: "Instagram", placeholder: "instagram.com/yourhandle" },
                { key: "twitter", label: "Twitter/X", placeholder: "twitter.com/yourhandle" },
                { key: "facebook", label: "Facebook", placeholder: "facebook.com/yourpage" },
                { key: "youtube", label: "YouTube", placeholder: "youtube.com/@yourchannel" },
                { key: "spotify", label: "Spotify", placeholder: "open.spotify.com/artist/..." },
                { key: "apple_music", label: "Apple Music", placeholder: "music.apple.com/artist/..." },
              ].map((social) => (
                <div key={social.key}>
                  <label htmlFor={social.key} className="block text-sm font-medium mb-2">
                    {social.label}
                  </label>
                  <input
                    id={social.key}
                    type="url"
                    value={formData.social_links[social.key as keyof typeof formData.social_links]}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        social_links: {
                          ...formData.social_links,
                          [social.key]: e.target.value,
                        },
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-lg bg-card border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                    placeholder={social.placeholder}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t border-border">
            <button
              type="button"
              onClick={() => navigate({ to: "/artist-dashboard" })}
              disabled={saveMutation.isPending}
              className="flex-1 px-6 py-3 rounded-lg bg-accent hover:bg-accent/80 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending || !formData.name}
              className="flex-1 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
