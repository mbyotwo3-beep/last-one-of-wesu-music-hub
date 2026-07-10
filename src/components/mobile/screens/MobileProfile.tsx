import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, Mic2, UserCircle, CreditCard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUserRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { updateProfile } from "@/lib/listener.functions";
import { uploadFileToBucket } from "@/lib/storage";
import { cacheProfile } from "@/lib/offline-cache";

/**
 * Mobile Profile screen — avatar, role badge, edit form, sign out.
 *
 * Feature: wesu-plus-completion
 */
export function MobileProfile() {
  const { user } = useAuth();
  const { isArtist, isSuperAdmin, isAdmin } = useUserRoles();
  const navigate = useNavigate();
  const updateFn = useServerFn(updateProfile);

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
            full_name: data.full_name ?? "",
            bio: data.bio ?? "",
            avatar_url: data.avatar_url ?? "",
            location: data.location ?? "",
          };
          setForm(profile);
          // Cache for offline use
          cacheProfile({ ...profile, email: user.email ?? "" }).catch(() => {});
        }
      });
  }, [user]);

  const m = useMutation({ mutationFn: updateFn });

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
    <div className="pb-8 px-4">
      {/* Avatar + name + role */}
      <div className="flex flex-col items-center py-8 gap-3">
        <div className="size-20 rounded-full bg-card border-2 border-border overflow-hidden flex items-center justify-center">
          {form.avatar_url ? (
            <img
              src={form.avatar_url}
              alt={form.full_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <UserCircle className="size-12 text-muted-foreground" />
          )}
        </div>
        <div className="text-center">
          <p className="font-bold text-lg">{form.full_name || "Your Name"}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <span className="inline-block mt-1 px-3 py-0.5 bg-primary/15 text-primary text-xs font-semibold rounded-full">
            {roleBadge}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ data: form });
        }}
        className="space-y-4 mb-6"
      >
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Edit Profile
        </h2>
        <label className="block text-sm">
          Full name
          <input
            className="mt-1 w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Location
          <input
            className="mt-1 w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Bio
          <textarea
            rows={3}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-card border border-border text-sm"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Avatar
          <input
            type="file"
            accept="image/*"
            className="mt-1 block text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f || !user) return;
              setUploading(true);
              try {
                const path = await uploadFileToBucket("user-avatars", user.id, f);
                setForm((s) => ({ ...s, avatar_url: path }));
              } catch (err) {
                alert((err as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {m.error && <p className="text-sm text-destructive">{(m.error as Error).message}</p>}
        {m.isSuccess && <p className="text-sm text-primary">Saved.</p>}
        <button
          disabled={m.isPending || uploading}
          className="w-full min-h-[44px] bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save profile"}
        </button>
      </form>

      {/* Quick links */}
      <div className="space-y-2 mb-6">
        {isArtist && (
          <Link
            to="/artist-studio"
            className="flex items-center gap-3 min-h-[44px] px-4 bg-card border border-border rounded-xl text-sm font-medium"
          >
            <Mic2 className="size-4 text-primary" />
            Artist Studio
          </Link>
        )}
        {!isArtist && (
          <Link
            to="/become-artist"
            className="flex items-center gap-3 min-h-[44px] px-4 bg-card border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors"
          >
            <Mic2 className="size-4 text-primary" />
            Become an Artist
          </Link>
        )}
        <Link
          to="/subscriptions"
          className="flex items-center gap-3 min-h-[44px] px-4 bg-card border border-border rounded-xl text-sm font-medium"
        >
          <CreditCard className="size-4 text-muted-foreground" />
          Manage Subscription
        </Link>
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
  );
}
