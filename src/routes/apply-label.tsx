import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import { applyForLabel } from "@/lib/labels.functions";

export const Route = createFileRoute("/apply-label")({
  head: () => ({ meta: [{ title: "Apply for a Label — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function Page() {
  const nav = useNavigate();
  const fn = useServerFn(applyForLabel);
  const m = useMutation({ 
    mutationFn: fn, 
    onSuccess: () => {
      toast.success("Label application submitted successfully!");
      nav({ to: "/label-dashboard" });
    },
    onError: (error) => {
      toast.error(`Failed to submit application: ${(error as Error).message}`);
    },
  });
  const [form, setForm] = useState({ name: "", bio: "", contact_email: "", logo_url: "" });
  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Start a record label</h1>
      <p className="text-muted-foreground mb-6">
        An admin will review your application. Once approved you can invite artists and collect a
        cut of their sales.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ data: form });
        }}
        className="bg-card border border-border rounded-2xl p-6 space-y-3"
      >
        <input
          required
          placeholder="Label name"
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Contact email"
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.contact_email}
          onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
        />
        <input
          placeholder="Logo URL (optional)"
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.logo_url}
          onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
        />
        <textarea
          placeholder="About the label"
          rows={4}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
        {m.error ? <p className="text-sm text-destructive">{(m.error as Error).message}</p> : null}
        <button
          disabled={m.isPending || !form.name}
          className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          {m.isPending ? "Submitting…" : "Submit application"}
        </button>
      </form>
    </div>
  );
}
