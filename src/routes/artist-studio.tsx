import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Wallet, FolderPlus, Users, Building2, Star } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { useAuth } from "@/hooks/use-auth";
import { uploadFileToBucket } from "@/lib/storage";
import { toast } from "sonner";
import {
  uploadSong,
  createAlbum,
  listMyAlbums,
  requestPayout,
  listMyPayouts,
  setCollabPrefs,
  leaveLabel,
  listMyLabelInvites,
  listMySongs,
} from "@/lib/artist.functions";
import { getMyArtistOverview } from "@/lib/user.functions";
import { inviteCollaborator } from "@/lib/collabs.functions";
import { respondToLabelInvite } from "@/lib/labels.functions";
import { supabase } from "@/integrations/supabase/client";
import { usePlatform } from "@/hooks/use-platform";
import { MobileArtistStudio } from "@/components/mobile/screens/MobileArtistStudio";

export const Route = createFileRoute("/artist-studio")({
  head: () => ({ meta: [{ title: "Artist Studio — Wesu+" }] }),
  component: () => (
    <RoleGate require="artist">
      <ArtistStudioRoute />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function ArtistStudioRoute() {
  const platform = usePlatform();
  return platform === "native" ? <MobileArtistStudio /> : <Page />;
}

type Tab = "upload" | "album" | "collabs" | "label" | "features" | "payouts";

function Page() {
  const [tab, setTab] = useState<Tab>("upload");
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "upload", label: "Upload Song", icon: Upload },
    { id: "album", label: "Albums", icon: FolderPlus },
    { id: "collabs", label: "Collaborators", icon: Users },
    { id: "label", label: "Label", icon: Building2 },
    { id: "features", label: "Features", icon: Star },
    { id: "payouts", label: "Payouts", icon: Wallet },
  ];
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">Artist Studio</h1>
      <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === "upload" && <UploadTab />}
      {tab === "album" && <AlbumTab />}
      {tab === "collabs" && <CollabsTab />}
      {tab === "label" && <LabelTab />}
      {tab === "features" && <FeaturesTab />}
      {tab === "payouts" && <PayoutTab />}
    </div>
  );
}

function CollabsTab() {
  const songsFn = useServerFn(listMySongs);
  const inviteFn = useServerFn(inviteCollaborator);
  const { data: songs } = useQuery({
    queryKey: ["my-songs"],
    queryFn: () => songsFn(),
    retry: false,
  });
  const m = useMutation({
    mutationFn: inviteFn,
    onSuccess: () => {
      toast.success("Collaborator invite sent successfully");
    },
    onError: (error) => {
      toast.error(`Failed to send invite: ${error.message}`);
    },
  });
  const [form, setForm] = useState({
    song_id: "",
    artist_id: "",
    role: "featured" as any,
    split_pct: 10,
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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Invite collaborators to one of your songs and assign a revenue split. Total splits cannot
        exceed 100%.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ data: form });
        }}
        className="bg-card border border-border rounded-2xl p-6 space-y-3"
      >
        <select
          required
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.song_id}
          onChange={(e) => setForm({ ...form, song_id: e.target.value })}
        >
          <option value="">— Select your song —</option>
          {(songs ?? []).map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border"
            placeholder="Search artist by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={find}
            className="px-4 py-2 rounded-full bg-secondary border border-border text-sm"
          >
            Search
          </button>
        </div>
        {results.length > 0 && (
          <select
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.artist_id}
            onChange={(e) => setForm({ ...form, artist_id: e.target.value })}
          >
            <option value="">— Pick artist —</option>
            {results.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-2 gap-3">
          <select
            className="px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as any })}
          >
            <option value="featured">Featured</option>
            <option value="producer">Producer</option>
            <option value="writer">Writer</option>
            <option value="remixer">Remixer</option>
          </select>
          <input
            type="number"
            min={0}
            max={100}
            className="px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.split_pct}
            onChange={(e) => setForm({ ...form, split_pct: Number(e.target.value) })}
          />
        </div>
        {m.error && <p className="text-sm text-destructive">{(m.error as Error).message}</p>}
        {m.isSuccess && <p className="text-sm text-primary">Invite sent.</p>}
        <button
          disabled={m.isPending || !form.song_id || !form.artist_id}
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
        >
          Send invite
        </button>
      </form>
      <Link to="/collabs" className="text-sm text-primary underline">
        See your incoming &amp; outgoing invites →
      </Link>
    </div>
  );
}

function LabelTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listMyLabelInvites);
  const respondFn = useServerFn(respondToLabelInvite);
  const leaveFn = useServerFn(leaveLabel);
  const { data } = useQuery({ queryKey: ["my-label-invites"], queryFn: () => fn(), retry: false });
  const respondM = useMutation({
    mutationFn: respondFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-label-invites"] });
      toast.success("Label invite response recorded");
    },
    onError: (error) => {
      toast.error(`Failed to respond to invite: ${error.message}`);
    },
  });
  const leaveM = useMutation({
    mutationFn: leaveFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-label-invites"] });
      toast.success("Successfully left label");
    },
    onError: (error) => {
      toast.error(`Failed to leave label: ${error.message}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-semibold mb-2">Your label</h3>
        {(data as any)?.current?.label_id ? (
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">You're signed to a label.</span>
            <button
              onClick={() => leaveM.mutate(undefined as any)}
              className="text-xs text-destructive"
            >
              Leave label
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You're independent. Labels can invite you below.
          </p>
        )}
      </div>
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-semibold mb-3">Pending invites</h3>
        {!data || data.invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invites.</p>
        ) : (
          <ul className="space-y-2">
            {data.invites.map((i: any) => (
              <li key={i.id} className="flex justify-between items-center text-sm">
                <span>
                  {i.labels?.name} — {i.royalty_pct}% royalty to you
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => respondM.mutate({ data: { id: i.id, accept: true } })}
                    className="text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respondM.mutate({ data: { id: i.id, accept: false } })}
                    className="text-xs px-3 py-1 rounded-full bg-secondary border border-border"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FeaturesTab() {
  const fn = useServerFn(setCollabPrefs);
  const m = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success("Feature settings saved successfully");
    },
    onError: (error) => {
      toast.error(`Failed to save settings: ${error.message}`);
    },
  });
  const [form, setForm] = useState({
    accepts_collabs: true,
    allow_features: false,
    feature_rate: 0,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ data: form });
      }}
      className="bg-card border border-border rounded-2xl p-6 space-y-3 max-w-md"
    >
      <h3 className="font-semibold">Feature availability</h3>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.accepts_collabs}
          onChange={(e) => setForm({ ...form, accepts_collabs: e.target.checked })}
        />{" "}
        Accept collaboration invites from other artists
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.allow_features}
          onChange={(e) => setForm({ ...form, allow_features: e.target.checked })}
        />{" "}
        Available to be featured on fan-requested tracks
      </label>
      <label className="block text-sm">
        Feature rate (ZMW)
        <input
          type="number"
          min={0}
          step="0.01"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.feature_rate}
          onChange={(e) => setForm({ ...form, feature_rate: Number(e.target.value) })}
        />
      </label>
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

function UploadTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const upload = useServerFn(uploadSong);
  const albumsFn = useServerFn(listMyAlbums);
  const { data: albums } = useQuery({
    queryKey: ["my-albums"],
    queryFn: () => albumsFn(),
    retry: false,
  });
  const [form, setForm] = useState({ title: "", genre: "", price: 0, album_id: "" as string });
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: upload,
    onSuccess: () => {
      setMsg("Submitted! Awaiting moderation.");
      qc.invalidateQueries({ queryKey: ["my-songs"] });
      toast.success("Song uploaded successfully");
    },
    onError: (error) => {
      toast.error(`Failed to upload song: ${error.message}`);
    },
  });

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!user || !audio) return;
        setBusy(true);
        setMsg(null);
        try {
          const audio_url = await uploadFileToBucket("song-audio", user.id, audio);
          const cover_url = cover
            ? await uploadFileToBucket("album-art", user.id, cover)
            : undefined;
          await m.mutateAsync({
            data: { ...form, audio_url, cover_url, album_id: form.album_id || null },
          });
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      className="bg-card border border-border rounded-2xl p-6 space-y-4"
    >
      <label className="block text-sm">
        Title
        <input
          required
          className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Genre
          <input
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Price (ZMW, 0 = free)
          <input
            type="number"
            min="0"
            step="0.01"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="block text-sm">
        Album (optional)
        <select
          className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.album_id}
          onChange={(e) => setForm({ ...form, album_id: e.target.value })}
        >
          <option value="">— Single —</option>
          {(albums ?? []).map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Audio file (mp3/m4a/wav)
        <input
          required
          type="file"
          accept="audio/*"
          className="mt-1 block"
          onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
        />
      </label>
      <label className="block text-sm">
        Cover art (optional)
        <input
          type="file"
          accept="image/*"
          className="mt-1 block"
          onChange={(e) => setCover(e.target.files?.[0] ?? null)}
        />
      </label>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <button
        disabled={busy}
        className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold"
      >
        {busy ? "Uploading…" : "Upload song"}
      </button>
    </form>
  );
}

function AlbumTab() {
  const qc = useQueryClient();
  const create = useServerFn(createAlbum);
  const list = useServerFn(listMyAlbums);
  const { data: albums } = useQuery({
    queryKey: ["my-albums"],
    queryFn: () => list(),
    retry: false,
  });
  const m = useMutation({
    mutationFn: create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-albums"] });
      toast.success("Album created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create album: ${error.message}`);
    },
  });
  const { user } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", price: 0 });
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) return;
          setBusy(true);
          try {
            const cover_url = cover
              ? await uploadFileToBucket("album-art", user.id, cover)
              : undefined;
            await m.mutateAsync({ data: { ...form, cover_url } });
            setForm({ title: "", description: "", price: 0 });
            setCover(null);
          } finally {
            setBusy(false);
          }
        }}
        className="bg-card border border-border rounded-2xl p-6 space-y-3"
      >
        <h3 className="font-semibold">New album</h3>
        <input
          required
          placeholder="Title"
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <textarea
          placeholder="Description"
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          type="number"
          placeholder="Price ZMW"
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setCover(e.target.files?.[0] ?? null)}
        />
        <button
          disabled={busy}
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
        >
          Create
        </button>
      </form>
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-semibold mb-3">Your albums</h3>
        {(albums ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No albums yet.</p>
        ) : (
          <ul className="space-y-2">
            {(albums ?? []).map((a: any) => (
              <li key={a.id} className="text-sm">
                • {a.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PayoutTab() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getMyArtistOverview);
  const requestFn = useServerFn(requestPayout);
  const listFn = useServerFn(listMyPayouts);
  const { data: overview } = useQuery({
    queryKey: ["artist-overview"],
    queryFn: () => overviewFn(),
    retry: false,
  });
  const { data: payouts } = useQuery({
    queryKey: ["my-payouts"],
    queryFn: () => listFn(),
    retry: false,
  });
  const m = useMutation({
    mutationFn: requestFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-payouts"] });
      toast.success("Payout request submitted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to request payout: ${error.message}`);
    },
  });
  const [form, setForm] = useState({ amount: 0, method_code: "MTN_MOMO", destination: "" });

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">Available earnings</p>
        <p className="text-3xl font-bold mt-1">
          ZMW {Number(overview?.totalRevenueZmw ?? 0).toFixed(2)}
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ data: form });
        }}
        className="bg-card border border-border rounded-2xl p-6 space-y-3"
      >
        <h3 className="font-semibold">Request payout</h3>
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
          placeholder="Destination (phone / account number)"
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={form.destination}
          onChange={(e) => setForm({ ...form, destination: e.target.value })}
        />
        {m.error ? <p className="text-sm text-destructive">{(m.error as Error).message}</p> : null}
        <button
          disabled={m.isPending}
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
        >
          Request
        </button>
      </form>
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-semibold mb-3">History</h3>
        {(payouts ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(payouts ?? []).map((p: any) => (
              <li key={p.id} className="flex justify-between">
                <span>
                  ZMW {Number(p.amount).toFixed(2)} • {p.method_code}
                </span>
                <span className="text-xs text-muted-foreground">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
