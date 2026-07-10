import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserCircle } from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { updateProfile } from "@/lib/listener.functions";
import { uploadFileToBucket } from "@/lib/storage";
import { usePlatform } from "@/hooks/use-platform";
import { MobileProfile } from "@/components/mobile/screens/MobileProfile";

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
  const platform = usePlatform();
  return platform === "native" ? <MobileProfile /> : <Page />;
}

function Page() {
  const { user } = useAuth();
  const update = useServerFn(updateProfile);
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
        if (data)
          setForm({
            full_name: data.full_name ?? "",
            bio: data.bio ?? "",
            avatar_url: data.avatar_url ?? "",
            location: data.location ?? "",
          });
      });
  }, [user]);

  const m = useMutation({ 
    mutationFn: async (data: any) => {
      console.log("[Profile] Updating profile with data:", data);
      const updateStart = Date.now();
      try {
        const result = await update(data);
        console.log("[Profile] Profile update completed:", {
          result,
          duration: Date.now() - updateStart
        });
        return result;
      } catch (error) {
        console.error("[Profile] Update failed:", {
          error,
          errorMessage: (error as Error).message,
          errorStack: (error as Error).stack,
          data
        });
        throw error;
      }
    },
    onSuccess: () => {
      console.log("[Profile] Save successful");
      toast.success("Profile updated successfully!");
    },
    onError: (error) => {
      console.error("[Profile] Save failed:", error);
      const errorMsg = (error as Error).message;
      toast.error(`Failed to update profile: ${errorMsg}`, {
        description: "Check the browser console (F12) for detailed error information.",
        duration: 5000
      });
    },
  });

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="flex items-center gap-3 mb-6">
        <UserCircle className="size-6 text-primary" />
        <h1 className="text-3xl font-bold">Your profile</h1>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ data: form });
        }}
        className="bg-card border border-border rounded-2xl p-6 space-y-4"
      >
        <label className="block text-sm">
          Full name
          <input
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Location
          <input
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Bio
          <textarea
            rows={3}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Avatar
          <input
            type="file"
            accept="image/*"
            className="mt-1 block"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f || !user) return;
              
              console.log("[Profile] Avatar file selected:", {
                fileName: f.name,
                fileSize: f.size,
                fileType: f.type
              });
              
              setUploading(true);
              try {
                const uploadStart = Date.now();
                const path = await uploadFileToBucket("user-avatars", user.id, f);
                console.log("[Profile] Avatar uploaded successfully:", {
                  path,
                  duration: Date.now() - uploadStart
                });
                setForm((s) => ({ ...s, avatar_url: path }));
                toast.success("Avatar uploaded successfully!");
              } catch (err) {
                console.error("[Profile] Avatar upload failed:", {
                  error: err,
                  errorMessage: (err as Error).message,
                  fileName: f.name,
                  fileSize: f.size
                });
                toast.error(`Avatar upload failed: ${(err as Error).message}`);
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {form.avatar_url && (
          <p className="text-xs text-muted-foreground">Uploaded: {form.avatar_url}</p>
        )}
        {m.error ? <p className="text-sm text-destructive">{(m.error as Error).message}</p> : null}
        {m.isSuccess ? <p className="text-sm text-primary">Saved.</p> : null}
        <button
          disabled={m.isPending || uploading}
          className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          {m.isPending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
