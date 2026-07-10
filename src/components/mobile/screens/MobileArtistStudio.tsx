import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { uploadFileToBucket } from "@/lib/storage";
import {
  uploadSong,
  createAlbum,
  listMyAlbums,
  requestPayout,
  listMyPayouts,
} from "@/lib/artist.functions";
import { getMyArtistOverview } from "@/lib/user.functions";

/**
 * Mobile Artist Studio — segmented Radix Tabs for 6 panels.
 * Mirrors the web studio functionality in a mobile-optimised layout.
 *
 * Feature: wesu-plus-completion
 */
export function MobileArtistStudio() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">Artist Studio</h1>
      </div>
      <Tabs defaultValue="upload" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mb-2 flex h-10 overflow-x-auto shrink-0">
          <TabsTrigger value="upload" className="text-xs shrink-0">
            Upload
          </TabsTrigger>
          <TabsTrigger value="albums" className="text-xs shrink-0">
            Albums
          </TabsTrigger>
          <TabsTrigger value="collabs" className="text-xs shrink-0">
            Collabs
          </TabsTrigger>
          <TabsTrigger value="label" className="text-xs shrink-0">
            Label
          </TabsTrigger>
          <TabsTrigger value="features" className="text-xs shrink-0">
            Features
          </TabsTrigger>
          <TabsTrigger value="payouts" className="text-xs shrink-0">
            Payouts
          </TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-y-auto">
          <TabsContent value="upload" className="mt-0 p-4">
            <UploadTab />
          </TabsContent>
          <TabsContent value="albums" className="mt-0 p-4">
            <AlbumsTab />
          </TabsContent>
          <TabsContent value="collabs" className="mt-0 p-4">
            <p className="text-sm text-muted-foreground">
              Use the web Artist Studio for full collaborator management.
            </p>
          </TabsContent>
          <TabsContent value="label" className="mt-0 p-4">
            <p className="text-sm text-muted-foreground">
              Use the web Artist Studio to manage label invites.
            </p>
          </TabsContent>
          <TabsContent value="features" className="mt-0 p-4">
            <p className="text-sm text-muted-foreground">
              Use the web Artist Studio to manage feature availability.
            </p>
          </TabsContent>
          <TabsContent value="payouts" className="mt-0 p-4">
            <PayoutsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function UploadTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadSong);
  const albumsFn = useServerFn(listMyAlbums);
  const { data: albums } = useQuery({
    queryKey: ["my-albums"],
    queryFn: () => albumsFn(),
    retry: false,
  });

  const [form, setForm] = useState({ title: "", genre: "", price: 0, album_id: "" });
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: uploadFn,
    onSuccess: () => {
      setMsg("Submitted! Awaiting moderation.");
      qc.invalidateQueries({ queryKey: ["my-songs"] });
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
      className="space-y-4"
    >
      <label className="block text-sm">
        Title
        <input
          required
          className="mt-1 w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Genre
          <input
            className="mt-1 w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Price (ZMW)
          <input
            type="number"
            min="0"
            step="0.01"
            className="mt-1 w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="block text-sm">
        Audio file
        <input
          required
          type="file"
          accept="audio/*"
          className="mt-1 block text-sm"
          onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
        />
      </label>
      <label className="block text-sm">
        Cover art (optional)
        <input
          type="file"
          accept="image/*"
          className="mt-1 block text-sm"
          onChange={(e) => setCover(e.target.files?.[0] ?? null)}
        />
      </label>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <button
        disabled={busy || !audio}
        className="w-full min-h-[44px] bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Upload song"}
      </button>
    </form>
  );
}

function AlbumsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const createFn = useServerFn(createAlbum);
  const listFn = useServerFn(listMyAlbums);
  const { data: albums } = useQuery({
    queryKey: ["my-albums"],
    queryFn: () => listFn(),
    retry: false,
  });
  const m = useMutation({
    mutationFn: createFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-albums"] }),
  });
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
        className="space-y-3"
      >
        <h3 className="font-semibold text-sm">New Album</h3>
        <input
          required
          placeholder="Title"
          className="w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <input
          type="number"
          placeholder="Price ZMW"
          className="w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
        />
        <input
          type="file"
          accept="image/*"
          className="text-sm"
          onChange={(e) => setCover(e.target.files?.[0] ?? null)}
        />
        <button
          disabled={busy}
          className="w-full min-h-[44px] bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-50"
        >
          Create album
        </button>
      </form>
      <div>
        <h3 className="font-semibold text-sm mb-2">Your Albums</h3>
        {(albums ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No albums yet.</p>
        ) : (
          (albums ?? []).map((a: any) => (
            <div key={a.id} className="py-2 text-sm border-b border-border">
              {a.title}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PayoutsTab() {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-payouts"] }),
  });
  const [form, setForm] = useState({ amount: 0, method_code: "MTN_MOMO", destination: "" });

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs text-muted-foreground">Available earnings</p>
        <p className="text-2xl font-bold">
          ZMW {Number(overview?.totalRevenueZmw ?? 0).toFixed(2)}
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ data: form });
        }}
        className="space-y-3"
      >
        <h3 className="font-semibold text-sm">Request payout</h3>
        <input
          required
          type="number"
          min="1"
          step="0.01"
          placeholder="Amount"
          className="w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
        />
        <select
          className="w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
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
          placeholder="Phone / account number"
          className="w-full min-h-[44px] px-3 rounded-lg bg-card border border-border text-sm"
          value={form.destination}
          onChange={(e) => setForm({ ...form, destination: e.target.value })}
        />
        {m.error && <p className="text-xs text-destructive">{(m.error as Error).message}</p>}
        <button
          disabled={m.isPending}
          className="w-full min-h-[44px] bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-50"
        >
          Request payout
        </button>
      </form>
    </div>
  );
}
