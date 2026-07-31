import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, Mic2, UserCircle, Pencil, ArrowLeft, Camera, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useUserRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { updateProfile } from "@/lib/listener.functions";
import { uploadFileToBucket } from "@/lib/storage";
import { cacheProfile } from "@/lib/offline-cache";
import { StorageImage } from "@/components/StorageImage";

/**
 * Mobile Profile screen — avatar, role badge, profile information view, edit form toggle, sign out.
 */
export function MobileProfile() {
  const { user } = useAuth();
  const { isArtist, isSuperAdmin, isAdmin } = useUserRoles();
  const navigate = useNavigate();
  const updateFn = useServerFn(updateProfile);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", bio: "", avatar_url: "", location: "" });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const profile = {
            full_name: data.full_name ?? user.user_metadata?.full_name ?? "",
            bio: data.bio ?? "",
            avatar_url: data.avatar_url ?? "",
            location: data.location ?? "",
          };
          setForm(profile);
          cacheProfile({ ...profile, email: user.email ?? "" }).catch(() => {});
        } else if (user.user_metadata?.full_name) {
          setForm((prev) => ({ ...prev, full_name: user.user_metadata.full_name }));
        }
      });
  }, [user]);

  const m = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      toast.success("Profile saved!");
      setIsEditing(false);
    },
    onError: (err) => {
      toast.error(`Update failed: ${(err as Error).message}`);
    },
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const roleBadge = isSuperAdmin
    ? "Superadmin"
    : isAdmin
      ? "Admin"
      : isArtist
        ? "Artist"
        : "Listener";

  return (
    <div className="pb-8 px-4 pt-4">
      {!isEditing ? (
        /* Read-Only Overview Mode */
        <div className="space-y-6">
          {/* Avatar + name + role */}
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center text-center gap-3 shadow-sm">
            {form.avatar_url ? (
              <StorageImage
                bucket="user-avatars"
                path={form.avatar_url}
                alt={form.full_name || "Avatar"}
                className="size-20 rounded-full bg-secondary border-2 border-primary/20 overflow-hidden object-cover"
              />
            ) : (
              <div className="size-20 rounded-full bg-primary/10 border-2 border-primary/20 overflow-hidden flex items-center justify-center">
                <UserCircle className="size-12 text-primary" />
              </div>
            )}

            <div>
              <p className="font-extrabold text-xl text-foreground">
                {form.full_name || user?.user_metadata?.full_name || "Wesu Listener"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              <span className="inline-block mt-2 px-3 py-0.5 bg-primary/15 text-primary text-xs font-semibold rounded-full">
                {roleBadge}
              </span>
            </div>

            <button
              onClick={() => setIsEditing(true)}
              className="mt-2 w-full min-h-[44px] flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm shadow-sm"
            >
              <Pencil className="size-4" />
              Edit Profile
            </button>
          </div>

          {/* Details Card */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-sm text-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Profile Details
            </h2>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between py-1 border-b border-border/60">
                <span className="text-muted-foreground text-xs">Location</span>
                <span className="font-medium flex items-center gap-1">
                  {form.location ? (
                    <>
                      <MapPin className="size-3 text-muted-foreground" />
                      {form.location}
                    </>
                  ) : (
                    "Not set"
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/60">
                <span className="text-muted-foreground text-xs">Email</span>
                <span className="font-medium text-xs truncate max-w-[200px]">
                  {user?.email}
                </span>
              </div>

              {form.bio && (
                <div className="pt-2">
                  <span className="text-muted-foreground text-xs block mb-1">Bio</span>
                  <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/40 p-3 rounded-xl whitespace-pre-line">
                    {form.bio}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="space-y-2">
            {isArtist ? (
              <Link
                to="/artist-studio"
                className="flex items-center gap-3 min-h-[44px] px-4 bg-card border border-border rounded-xl text-sm font-semibold"
              >
                <Mic2 className="size-4 text-primary" />
                Artist Studio
              </Link>
            ) : (
              <Link
                to="/become-artist"
                className="flex items-center gap-3 min-h-[44px] px-4 bg-card border border-border rounded-xl text-sm font-semibold hover:bg-accent transition-colors"
              >
                <Mic2 className="size-4 text-primary" />
                Become an Artist
              </Link>
            )}
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
            Sign Out
          </button>
        </div>
      ) : (
        /* Edit Form Mode */
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <button
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
            <h2 className="text-base font-bold">Edit Profile</h2>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate({ data: form });
            }}
            className="space-y-4 bg-card border border-border rounded-2xl p-5 shadow-sm"
          >
            {/* Avatar Upload */}
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              {form.avatar_url ? (
                <StorageImage
                  bucket="user-avatars"
                  path={form.avatar_url}
                  alt="Avatar"
                  className="size-14 rounded-full bg-secondary border border-border overflow-hidden object-cover"
                />
              ) : (
                <div className="size-14 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center">
                  <UserCircle className="size-8 text-muted-foreground" />
                </div>
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary border border-border text-xs font-semibold cursor-pointer">
                <Camera className="size-3.5 text-primary" />
                {uploading ? "Uploading..." : "Change Photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !user) return;
                    setUploading(true);
                    try {
                      const path = await uploadFileToBucket("user-avatars", user.id, f);
                      setForm((s) => ({ ...s, avatar_url: path }));
                      toast.success("Avatar uploaded");
                    } catch (err) {
                      toast.error((err as Error).message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            </div>

            <label className="block text-xs font-medium">
              Full name
              <input
                className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-secondary border border-border text-sm"
                placeholder="Your full name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </label>

            <label className="block text-xs font-medium">
              Location
              <input
                className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-secondary border border-border text-sm"
                placeholder="e.g. Lusaka, Zambia"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>

            <label className="block text-xs font-medium">
              Bio
              <textarea
                rows={3}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm"
                placeholder="Short bio"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </label>

            {m.error && (
              <p className="text-xs text-destructive">{(m.error as Error).message}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 min-h-[44px] bg-secondary border border-border rounded-xl text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={m.isPending || uploading}
                className="flex-1 min-h-[44px] bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {m.isPending ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
