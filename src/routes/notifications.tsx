import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, Check, Heart, User, Music } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useEffect } from "react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!user,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() } as any).eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Marked as read");
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unreadIds = rows?.filter((n: any) => !n.read_at).map((n: any) => n.id) || [];
      if (unreadIds.length === 0) return;
      await supabase.from("notifications").update({ read_at: new Date().toISOString() } as any).in("id", unreadIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
        return <Heart className="size-5 text-red-500 fill-red-500" />;
      case "follow":
        return <User className="size-5 text-primary" />;
      case "music":
        return <Music className="size-5 text-primary" />;
      default:
        return <Bell className="size-5 text-primary" />;
    }
  };

  const handleNotificationClick = (n: any) => {
    if (!n.read_at) {
      markRead.mutate(n.id);
    }
    if (n.link) {
      window.location.href = n.link;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="size-6 text-primary" />
          <h1 className="text-3xl font-bold">Notifications</h1>
        </div>
        {rows && rows.some((n: any) => !n.read_at) && (
          <button
            onClick={() => markAllRead.mutate()}
            className="text-sm text-primary hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="size-12 mx-auto mb-4 opacity-40" />
          <p>You're all caught up.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((n: any) => (
            <li
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-4 rounded-xl border cursor-pointer transition-all hover:bg-accent/50 ${
                n.read_at ? "bg-card border-border" : "bg-primary/5 border-primary/20"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 mt-1">
                  {getNotificationIcon(n.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground">{n.title}</div>
                  {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatTimeAgo(new Date(n.created_at))}
                  </p>
                </div>
                {!n.read_at && (
                  <div className="shrink-0">
                    <div className="size-2 rounded-full bg-primary mt-2" />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
