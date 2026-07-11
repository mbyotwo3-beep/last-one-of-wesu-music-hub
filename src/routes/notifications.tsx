import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="size-6 text-primary" />
        <h1 className="text-3xl font-bold">Notifications</h1>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="size-12 mx-auto mb-4 opacity-40" />
          <p>You're all caught up.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((n: any) => (
            <li
              key={n.id}
              className={`p-4 rounded-xl border border-border ${n.read_at ? "bg-card" : "bg-primary/5 border-primary/20"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{n.title}</div>
                  {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.read_at && (
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Check className="size-3" /> Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
