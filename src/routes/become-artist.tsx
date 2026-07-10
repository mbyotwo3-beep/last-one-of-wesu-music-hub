import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import { applyAsArtist } from "@/lib/artist.functions";
import { getMyArtistOverview } from "@/lib/user.functions";

export const Route = createFileRoute("/become-artist")({
  head: () => ({ meta: [{ title: "Become an Artist — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function Page() {
  const navigate = useNavigate();
  const apply = useServerFn(applyAsArtist);
  const fetchOverview = useServerFn(getMyArtistOverview);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-artist-overview"],
    queryFn: () => fetchOverview(),
  });

  const m = useMutation({
    mutationFn: apply,
    onSuccess: () => {
      toast.success("Artist application submitted successfully!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to submit application: ${(error as Error).message}`);
    },
  });
  const [form, setForm] = useState({ name: "", bio: "", genre: "" });

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  }

  const artist = data?.artist;

  if (artist && artist.status === "pending") {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center justify-center size-14 rounded-full bg-yellow-500/10 mb-4">
          <Clock className="size-6 text-yellow-500" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Application under review</h1>
        <p className="text-muted-foreground mb-8">
          Thanks for applying, {artist.name}! An admin is reviewing your artist application. You'll
          be notified as soon as it's approved and you can start uploading music.
        </p>
        <div className="bg-card border border-border rounded-2xl p-6 text-left mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Status</p>
          <p className="font-semibold text-yellow-500 capitalize">Pending review</p>
        </div>
        <Link
          to="/dashboard"
          className="inline-block px-5 py-2.5 rounded-full bg-secondary font-semibold"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (artist && artist.status === "approved") {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
          <CheckCircle2 className="size-6 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2">You're already an approved artist</h1>
        <p className="text-muted-foreground mb-8">Head to your artist dashboard to manage music.</p>
        <button
          onClick={() => navigate({ to: "/artist-dashboard" })}
          className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          Open Artist Dashboard
        </button>
      </div>
    );
  }

  const rejected = artist?.status === "rejected";

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="flex items-center gap-3 mb-6">
        <Mic2 className="size-6 text-primary" />
        <h1 className="text-3xl font-bold">
          {rejected ? "Reapply as an Artist" : "Become an Artist"}
        </h1>
      </div>
      {rejected && (
        <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex gap-3">
          <XCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            Your previous application was not approved. Update your details and submit again.
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground mb-8">
        Submit your application. An admin will review and approve you to start uploading music.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ data: form });
        }}
        className="bg-card border border-border rounded-2xl p-6 space-y-4"
      >
        <label className="block text-sm">
          Artist name
          <input
            required
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Genre
          <input
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value })}
            placeholder="Afrobeats, Hip-Hop…"
          />
        </label>
        <label className="block text-sm">
          Bio
          <textarea
            rows={4}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>
        {m.error ? <p className="text-sm text-destructive">{(m.error as Error).message}</p> : null}
        <button
          disabled={m.isPending}
          className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          {m.isPending ? "Submitting…" : "Submit application"}
        </button>
      </form>
    </div>
  );
}
