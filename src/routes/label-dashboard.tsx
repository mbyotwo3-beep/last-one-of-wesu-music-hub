import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, Users, DollarSign, Wallet } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { toast } from "sonner";
import {
  getMyLabel,
  listLabelRoster,
  listLabelRevenue,
  inviteArtistToLabel,
  setArtistRoyalty,
  removeArtistFromLabel,
  requestLabelPayout,
  updateLabel,
} from "@/lib/labels.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/label-dashboard")({
  head: () => ({ meta: [{ title: "Label Dashboard — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

type Tab = "overview" | "roster" | "revenue" | "payouts" | "settings";

function Page() {
  const getLabel = useServerFn(getMyLabel);
  const { data: label, isLoading, error } = useQuery({
    queryKey: ["my-label"],
    queryFn: () => getLabel(),
    retry: 1,
  });
  const [tab, setTab] = useState<Tab>("overview");

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <p className="text-destructive mb-4">Failed to load label data</p>
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }
  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading label data…</div>;
  if (!label) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <Building2 className="size-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">You don't run a label yet</h1>
        <Link
          to="/apply-label"
          className="inline-block mt-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          Apply for a label
        </Link>
      </div>
    );
  }
  if ((label as any).status !== "approved") {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <Building2 className="size-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">{(label as any).name}</h1>
        <p className="text-muted-foreground">
          Your label is{" "}
          <span className="font-semibold text-foreground">{(label as any).status}</span>. We'll
          notify you once an admin reviews it.
        </p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: Building2 },
    { id: "roster", label: "Roster", icon: Users },
    { id: "revenue", label: "Revenue", icon: DollarSign },
    { id: "payouts", label: "Payouts", icon: Wallet },
    { id: "settings", label: "Settings", icon: Building2 },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center gap-4 mb-6">
        <div className="size-16 rounded-xl bg-secondary overflow-hidden">
          {(label as any).logo_url && (
            <img src={(label as any).logo_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div>
          <h1 className="text-3xl font-bold">{(label as any).name}</h1>
          <p className="text-sm text-muted-foreground">
            Commission {(label as any).commission_pct}% of artists' net revenue
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview labelId={(label as any).id} />}
      {tab === "roster" && <Roster labelId={(label as any).id} />}
      {tab === "revenue" && <Revenue labelId={(label as any).id} />}
      {tab === "payouts" && <Payouts labelId={(label as any).id} />}
      {tab === "settings" && <Settings label={label as any} />}
    </div>
  );
}

function Overview({ labelId }: { labelId: string }) {
  const rosterFn = useServerFn(listLabelRoster);
  const revFn = useServerFn(listLabelRevenue);
  const { data: roster } = useQuery({
    queryKey: ["roster", labelId],
    queryFn: () => rosterFn({ data: { label_id: labelId } }),
    retry: false,
  });
  const { data: rev } = useQuery({
    queryKey: ["label-rev", labelId],
    queryFn: () => revFn({ data: { label_id: labelId } }),
    retry: false,
  });
  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-2xl font-bold">{roster?.length ?? 0}</p>
        <p className="text-xs text-muted-foreground mt-1">Active artists</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-2xl font-bold">ZMW {Number(rev?.total ?? 0).toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-1">Lifetime revenue</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-2xl font-bold">{rev?.splits.length ?? 0}</p>
        <p className="text-xs text-muted-foreground mt-1">Recent splits</p>
      </div>
    </div>
  );
}

function Roster({ labelId }: { labelId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLabelRoster);
  const inviteFn = useServerFn(inviteArtistToLabel);
  const royaltyFn = useServerFn(setArtistRoyalty);
  const removeFn = useServerFn(removeArtistFromLabel);
  const { data } = useQuery({
    queryKey: ["roster", labelId],
    queryFn: () => listFn({ data: { label_id: labelId } }),
    retry: false,
  });
  const inviteM = useMutation({
    mutationFn: inviteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", labelId] });
      toast.success("Artist invited successfully");
    },
    onError: (error) => {
      toast.error(`Failed to invite artist: ${error.message}`);
    },
  });
  const royaltyM = useMutation({
    mutationFn: royaltyFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", labelId] });
      toast.success("Royalty percentage updated");
    },
    onError: (error) => {
      toast.error(`Failed to update royalty: ${error.message}`);
    },
  });
  const removeM = useMutation({
    mutationFn: removeFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", labelId] });
      toast.success("Artist removed from label");
    },
    onError: (error) => {
      toast.error(`Failed to remove artist: ${error.message}`);
    },
  });

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  async function find() {
    const { data } = await supabase
      .from("artists")
      .select("id, name")
      .ilike("name", `%${search}%`)
      .eq("status", "approved")
      .limit(8);
    setResults(data ?? []);
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-semibold mb-3">Invite an artist</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={find}
            className="px-4 py-2 rounded-full bg-secondary border border-border text-sm"
          >
            Search
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-3 space-y-2">
            {results.map((a) => (
              <li key={a.id} className="flex justify-between items-center text-sm">
                <span>{a.name}</span>
                <button
                  onClick={() => inviteM.mutate({ data: { label_id: labelId, artist_id: a.id } })}
                  className="text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground"
                >
                  Invite
                </button>
              </li>
            ))}
          </ul>
        )}
        {inviteM.error && (
          <p className="text-sm text-destructive mt-2">{(inviteM.error as Error).message}</p>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-muted-foreground">
            <tr>
              <th className="text-left p-3">Artist</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Royalty %</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{r.artists?.name}</td>
                <td className="p-3 text-xs">{r.status}</td>
                <td className="p-3">
                  <input
                    type="number"
                    defaultValue={r.royalty_pct}
                    min={0}
                    max={100}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== r.royalty_pct)
                        royaltyM.mutate({ data: { id: r.id, royalty_pct: v } });
                    }}
                    className="w-20 px-2 py-1 rounded bg-secondary border border-border"
                  />
                </td>
                <td className="p-3">
                  <button
                    onClick={() => removeM.mutate({ data: { id: r.id } })}
                    className="text-xs text-destructive"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  No artists yet — invite one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Revenue({ labelId }: { labelId: string }) {
  const fn = useServerFn(listLabelRevenue);
  const { data } = useQuery({
    queryKey: ["label-rev", labelId],
    queryFn: () => fn({ data: { label_id: labelId } }),
    retry: false,
  });
  if (!data) return <div className="text-muted-foreground">Loading…</div>;
  return (
    <div>
      <div className="bg-card border border-border rounded-2xl p-6 mb-4">
        <p className="text-sm text-muted-foreground">Lifetime revenue</p>
        <p className="text-3xl font-bold mt-1">ZMW {Number(data.total).toFixed(2)}</p>
      </div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-muted-foreground">
            <tr>
              <th className="text-left p-3">When</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.splits.map((s: any) => (
              <tr key={s.created_at + s.amount} className="border-t border-border">
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleString()}
                </td>
                <td className="p-3">{s.payee_role}</td>
                <td className="p-3">ZMW {Number(s.amount).toFixed(2)}</td>
              </tr>
            ))}
            {data.splits.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-muted-foreground">
                  No revenue yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Payouts({ labelId }: { labelId: string }) {
  const fn = useServerFn(requestLabelPayout);
  const m = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success("Payout request submitted successfully");
    },
    onError: (error) => {
      toast.error(`Payout request failed: ${error.message}`);
    },
  });
  const [form, setForm] = useState({ amount: 0, method_code: "MTN_MOMO", destination: "" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ data: { label_id: labelId, ...form } });
      }}
      className="bg-card border border-border rounded-2xl p-6 space-y-3 max-w-md"
    >
      <h3 className="font-semibold">Request label payout</h3>
      <input
        required
        type="number"
        min="1"
        step="0.01"
        placeholder="Amount"
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
      />
      <select
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        value={form.method_code}
        onChange={(e) => setForm({ ...form, method_code: e.target.value })}
      >
        <option value="MTN_MOMO">MTN Mobile Money</option>
        <option value="AIRTEL_MONEY">Airtel Money</option>
        <option value="ZAMTEL_KWACHA">Zamtel Kwacha</option>
        <option value="BANK">Bank transfer</option>
      </select>
      <input
        required
        placeholder="Destination"
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        value={form.destination}
        onChange={(e) => setForm({ ...form, destination: e.target.value })}
      />
      {m.error && <p className="text-sm text-destructive">{(m.error as Error).message}</p>}
      {m.isSuccess && (
        <p className="text-sm text-primary">Submitted — pending superadmin approval.</p>
      )}
      <button
        disabled={m.isPending}
        className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
      >
        Request
      </button>
    </form>
  );
}

function Settings({ label }: { label: any }) {
  const fn = useServerFn(updateLabel);
  const m = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success("Label settings updated successfully");
    },
    onError: (error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });
  const [form, setForm] = useState({
    name: label.name,
    bio: label.bio ?? "",
    contact_email: label.contact_email ?? "",
    logo_url: label.logo_url ?? "",
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ data: { id: label.id, ...form } });
      }}
      className="bg-card border border-border rounded-2xl p-6 space-y-3 max-w-xl"
    >
      <input
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        value={form.contact_email}
        onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
      />
      <input
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        value={form.logo_url}
        onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
        placeholder="Logo URL"
      />
      <textarea
        rows={4}
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        value={form.bio}
        onChange={(e) => setForm({ ...form, bio: e.target.value })}
      />
      {m.isSuccess && <p className="text-sm text-primary">Saved.</p>}
      <button
        disabled={m.isPending}
        className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
      >
        Save
      </button>
    </form>
  );
}
