import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserCircle, Pencil, MapPin, Mail, Calendar, Mic2, LogOut, ArrowLeft, Camera } from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import { useAuth } from "@/hooks/use-auth";
import { useUserRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { updateProfile } from "@/lib/listener.functions";
import { uploadFileToBucket } from "@/lib/storage";
import { StorageImage } from "@/components/StorageImage";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <ProfileRoute />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function ProfileRoute() {
  return <Page />;
}

function Page() {
  const { user } = useAuth();
  const { isArtist, isSuperAdmin, isAdmin } = useUserRoles();
  const navigate = useNavigate();
  const update = useServerFn(updateProfile);

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
          setForm({
            full_name: data.full_name ?? user.user_metadata?.full_name ?? "",
            bio: data.bio ?? "",
            avatar_url: data.avatar_url ?? "",
            location: data.location ?? "",
          });
        } else if (user.user_metadata?.full_name) {
          setForm((prev) => ({ ...prev, full_name: user.user_metadata.full_name }));
        }
      });
  }, [user]);

  const m = useMutation({
    mutationFn: async (data: any) => {
      return await update(data);
    },
    onSuccess: () => {
      toast.success("Profile updated successfully!");
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error(`Failed to update profile: ${(error as Error).message}`);
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

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-12">
      {/* Read-Only Profile View */}
      {!isEditing ? (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-card border border-border rounded-3xl p-8 relative overflow-hidden shadow-lg">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {form.avatar_url ? (
                <StorageImage
                  bucket="user-avatars"
                  path={form.avatar_url}
                  alt={form.full_name || "User Avatar"}
                  className="size-24 rounded-full bg-secondary border-2 border-primary/20 overflow-hidden object-cover shrink-0"
                />
              ) : (
                <div className="size-24 rounded-full bg-primary/10 border-2 border-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                  <UserCircle className="size-16 text-primary" />
                </div>
              )}

              <div className="flex-1 text-center sm:text-left space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                      {form.full_name || user?.user_metadata?.full_name || "Wesu Listener"}
                    </h1>
                    <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-1.5 mt-1">
                      <Mail className="size-4" />
                      {user?.email}
                    </p>
                  </div>

                  <button
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm"
                  >
                    <Pencil className="size-4" />
                    Edit Profile
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                  <span className="px-3 py-1 bg-primary/15 text-primary text-xs font-semibold rounded-full">
                    {roleBadge}
                  </span>
                  {form.location && (
                    <span className="px-3 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full flex items-center gap-1">
                      <MapPin className="size-3 text-muted-foreground" />
                      {form.location}
                    </span>
                  )}
                  {memberSince && (
                    <span className="px-3 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full flex items-center gap-1">
                      <Calendar className="size-3 text-muted-foreground" />
                      Joined {memberSince}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bio */}
            {form.bio && (
              <div className="mt-6 pt-6 border-t border-border">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  About
                </h2>
                <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                  {form.bio}
                </p>
              </div>
            )}
          </div>

          {/* Account Details & Quick Actions */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Account Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3.5 bg-secondary/50 rounded-xl">
                <span className="text-xs text-muted-foreground block">Full Name</span>
                <span className="font-semibold text-foreground">
                  {form.full_name || "Not set"}
                </span>
              </div>
              <div className="p-3.5 bg-secondary/50 rounded-xl">
                <span className="text-xs text-muted-foreground block">Email Address</span>
                <span className="font-semibold text-foreground truncate block">
                  {user?.email || "Not set"}
                </span>
              </div>
              <div className="p-3.5 bg-secondary/50 rounded-xl">
                <span className="text-xs text-muted-foreground block">Location</span>
                <span className="font-semibold text-foreground">
                  {form.location || "Not set"}
                </span>
              </div>
              <div className="p-3.5 bg-secondary/50 rounded-xl">
                <span className="text-xs text-muted-foreground block">Account Role</span>
                <span className="font-semibold text-foreground">{roleBadge}</span>
              </div>
            </div>
          </div>

          {/* Action Links */}
          <div className="flex flex-col sm:flex-row gap-3">
            {isArtist ? (
              <Link
                to="/artist-studio"
                className="flex-1 flex items-center justify-center gap-2 p-3.5 bg-card border border-border rounded-xl font-semibold text-sm hover:border-primary/50 transition-colors"
              >
                <Mic2 className="size-4 text-primary" />
                Open Artist Studio
              </Link>
            ) : (
              <Link
                to="/become-artist"
                className="flex-1 flex items-center justify-center gap-2 p-3.5 bg-card border border-border rounded-xl font-semibold text-sm hover:border-primary/50 transition-colors"
              >
                <Mic2 className="size-4 text-primary" />
                Become an Artist
              </Link>
            )}

            <button
              onClick={handleSignOut}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold text-sm transition-colors"
            >
              <LogOut className="size-4" />
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        /* Editable Profile Form View */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back to profile
            </button>
            <h1 className="text-xl font-bold">Edit Profile</h1>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate({ data: form });
            }}
            className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-lg"
          >
            {/* Avatar Upload Field */}
            <div className="flex items-center gap-4 pb-4 border-b border-border">
              {form.avatar_url ? (
                <StorageImage
                  bucket="user-avatars"
                  path={form.avatar_url}
                  alt={form.full_name || "Avatar"}
                  className="size-16 rounded-full bg-secondary border border-border overflow-hidden object-cover"
                />
              ) : (
                <div className="size-16 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center">
                  <UserCircle className="size-10 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm font-medium cursor-pointer hover:bg-accent transition-colors">
                  <Camera className="size-4 text-primary" />
                  {uploading ? "Uploading..." : "Change Avatar"}
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
                        toast.success("Avatar uploaded!");
                      } catch (err) {
                        toast.error(`Avatar upload failed: ${(err as Error).message}`);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG or WEBP up to 5MB
                </p>
              </div>
            </div>

            <label className="block text-sm font-medium">
              Full Name
              <input
                className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Enter your full name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </label>

            <label className="block text-sm font-medium">
              Location
              <input
                className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="e.g. Lusaka, Zambia"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>

            <label className="block text-sm font-medium">
              Bio
              <textarea
                rows={3}
                className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Tell listeners a little bit about yourself"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </label>

            {m.error && (
              <p className="text-sm text-destructive font-medium">
                {(m.error as Error).message}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-5 py-2.5 rounded-full border border-border text-sm font-semibold hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={m.isPending || uploading}
                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {m.isPending ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

