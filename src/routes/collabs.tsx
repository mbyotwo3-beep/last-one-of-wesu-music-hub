import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Check, X } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { listMyCollabInvites, respondToCollabInvite } from "@/lib/collabs.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/collabs")({
  head: () => ({ meta: [{ title: "Collaborations — Wesu+" }] }),
  component: () => (
    <RoleGate require="artist">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyCollabInvites);
  const respondFn = useServerFn(respondToCollabInvite);
  const { data } = useQuery({ queryKey: ["my-collabs"], queryFn: () => listFn(), retry: false });
  const m = useMutation({
    mutationFn: respondFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-collabs"] });
      toast.success("Collaboration invite response recorded");
    },
    onError: (error) => {
      toast.error(`Failed to respond: ${error.message}`);
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-6">
        <Users className="size-6 text-primary" />
        <h1 className="text-3xl font-bold">Collaborations</h1>
      </div>

      <section className="mb-10">
        <h2 className="font-semibold mb-3">Incoming invites</h2>
        {!data || data.incoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <div className="space-y-2">
            {data.incoming.map((c: any) => (
              <div
                key={c.id}
                className="bg-card border border-border rounded-xl p-4 flex justify-between items-center"
              >
                <div>
                  <p className="font-medium">{c.songs?.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.role} • {c.split_pct}% split
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={m.isPending}
                    onClick={() => m.mutate({ data: { id: c.id, accept: true } })}
                    className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/15 text-primary"
                  >
                    <Check className="size-3" /> Accept
                  </button>
                  <button
                    disabled={m.isPending}
                    onClick={() => m.mutate({ data: { id: c.id, accept: false } })}
                    className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-destructive/15 text-destructive"
                  >
                    <X className="size-3" /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-3">Sent invites</h2>
        {!data || data.outgoing.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invites sent yet.</p>
        ) : (
          <div className="space-y-2">
            {data.outgoing.map((c: any) => (
              <div
                key={c.id}
                className="bg-card border border-border rounded-xl p-4 flex justify-between items-center text-sm"
              >
                <span>
                  {c.songs?.title} → {c.artists?.name} ({c.split_pct}%)
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.accepted ? "accepted" : "pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
