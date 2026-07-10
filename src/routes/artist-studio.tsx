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

type Tab = "upload" | "collabs" | "label" | "features" | "payouts";

function Page() {
  const [tab, setTab] = useState<Tab>("upload");
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "upload", label: "Upload Music", icon: Upload },
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
      {tab === "upload" && <UploadWizard />}
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


// ---------- Unified Upload Wizard (single OR album) ----------

const SINGLE_MIN = 10;
const SINGLE_MAX = 100;
const ALBUM_MIN = 150;
const ALBUM_MAX = 250;
const FREE_SONG_FEE = 100;

type UploadMode = "single" | "album";

function UploadWizard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadSong);
  const createAlbumFn = useServerFn(createAlbum);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<UploadMode>("single");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [tracks, setTracks] = useState<File[]>([]);
  const [tier, setTier] = useState<"free" | "paid">("paid");
  const [price, setPrice] = useState<number>(mode === "album" ? ALBUM_MIN : SINGLE_MIN);
  const [feeAgreed, setFeeAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function switchMode(next: UploadMode) {
    setMode(next);
    setTier("paid");
    setPrice(next === "album" ? ALBUM_MIN : SINGLE_MIN);
    if (next === "single") setTracks((t) => t.slice(0, 1));
  }

  function validatePricing(): string | null {
    if (mode === "single") {
      if (tier === "free") {
        if (!feeAgreed) return `Please acknowledge the K${FREE_SONG_FEE} maintenance fee`;
        return null;
      }
      if (!Number.isFinite(price) || price < SINGLE_MIN || price > SINGLE_MAX) {
        return `Song price must be between K${SINGLE_MIN} and K${SINGLE_MAX}`;
      }
    } else {
      if (!Number.isFinite(price) || price < ALBUM_MIN || price > ALBUM_MAX) {
        return `Album price must be between K${ALBUM_MIN} and K${ALBUM_MAX}`;
      }
    }
    return null;
  }

  async function submit() {
    if (!user) return;
    const perr = validatePricing();
    if (perr) return setError(perr);
    if (!title.trim()) return setError("Title is required");
    if (tracks.length === 0) return setError("Please add at least one audio file");

    setError(null);
    setBusy(true);
    try {
      const cover_url = cover
        ? await uploadFileToBucket("album-art", user.id, cover)
        : undefined;

      if (mode === "single") {
        const audio_url = await uploadFileToBucket("song-audio", user.id, tracks[0]);
        const res = await uploadFn({
          data: {
            title: title.trim(),
            audio_url,
            cover_url,
            genre: genre || undefined,
            price: tier === "free" ? 0 : price,
            album_id: null,
          },
        });
        setDone(
          tier === "free"
            ? `Song submitted. A K${FREE_SONG_FEE} maintenance fee will be billed on approval.`
            : `Song "${title}" submitted for review.`,
        );
        qc.invalidateQueries({ queryKey: ["my-songs"] });
        return res;
      }

      // Album flow
      const album = await createAlbumFn({
        data: {
          title: title.trim(),
          description: description || undefined,
          genre: genre || undefined,
          price,
          cover_url,
        },
      });
      for (const file of tracks) {
        const audio_url = await uploadFileToBucket("song-audio", user.id, file);
        await uploadFn({
          data: {
            title: file.name.replace(/\.[^.]+$/, ""),
            audio_url,
            cover_url,
            price,
            album_id: album.id,
          },
        });
      }
      setDone(`Album "${title}" with ${tracks.length} track${tracks.length === 1 ? "" : "s"} submitted for review.`);
      qc.invalidateQueries({ queryKey: ["my-albums"] });
      qc.invalidateQueries({ queryKey: ["my-songs"] });
      toast.success("Album uploaded successfully");
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
        <p className="text-lg font-semibold">✓ {done}</p>
        <button
          onClick={() => {
            setDone(null);
            setStep(1);
            setTitle("");
            setDescription("");
            setGenre("");
            setCover(null);
            setTracks([]);
            setTier("paid");
            setPrice(SINGLE_MIN);
            setFeeAgreed(false);
          }}
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
        >
          Upload another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span
              className={`size-6 rounded-full inline-flex items-center justify-center text-xs font-semibold ${
                step >= n ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {n}
            </span>
            <span className={step === n ? "text-foreground font-medium" : ""}>
              {n === 1 ? "Type" : n === 2 ? "Files" : "Pricing"}
            </span>
            {n < 3 && <span className="mx-2">→</span>}
          </div>
        ))}
      </div>

      {/* Step 1: pick type */}
      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["single", "album"] as UploadMode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`text-left p-6 rounded-2xl border-2 transition-colors ${
                mode === m ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                {m === "single" ? <Upload className="size-5" /> : <FolderPlus className="size-5" />}
                <h3 className="font-semibold">{m === "single" ? "Single Song" : "Album"}</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {m === "single"
                  ? `One track. Free (K${FREE_SONG_FEE} fee) or K${SINGLE_MIN}–K${SINGLE_MAX}.`
                  : `Multi-track release. Priced K${ALBUM_MIN}–K${ALBUM_MAX}.`}
              </p>
            </button>
          ))}
          <div className="sm:col-span-2 flex justify-end">
            <button
              onClick={() => setStep(2)}
              className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: files + metadata */}
      {step === 2 && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <input
            required
            placeholder={mode === "album" ? "Album title" : "Song title"}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Genre (optional)"
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
            {mode === "album" && (
              <input
                placeholder="Description (optional)"
                className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </div>

          <label className="block text-sm">
            Cover art (optional)
            <input
              type="file"
              accept="image/*"
              className="mt-1 block text-xs"
              onChange={(e) => setCover(e.target.files?.[0] ?? null)}
            />
          </label>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("audio/"));
              if (mode === "single") setTracks(files.slice(0, 1));
              else setTracks((prev) => [...prev, ...files]);
            }}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-secondary/30"
          >
            <Upload className="size-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Drop audio files here</p>
            <p className="text-xs text-muted-foreground mb-3">or</p>
            <input
              type="file"
              accept="audio/*"
              multiple={mode === "album"}
              className="text-xs"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (mode === "single") setTracks(files.slice(0, 1));
                else setTracks(files);
              }}
            />
          </div>

          {tracks.length > 0 && (
            <ul className="text-xs space-y-1">
              {tracks.map((f, i) => (
                <li key={i} className="flex justify-between items-center bg-secondary/30 rounded px-2 py-1">
                  <span className="truncate">{f.name}</span>
                  <button
                    onClick={() => setTracks((t) => t.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive text-xs"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-full bg-secondary border border-border text-sm"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!title.trim() || tracks.length === 0}
              className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: pricing */}
      {step === 3 && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          {mode === "single" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTier("free")}
                  className={`p-4 rounded-xl border-2 text-left ${
                    tier === "free" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="font-semibold text-sm">Free</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Listeners play free. You pay a K{FREE_SONG_FEE} maintenance fee on approval.
                  </p>
                </button>
                <button
                  onClick={() => setTier("paid")}
                  className={`p-4 rounded-xl border-2 text-left ${
                    tier === "paid" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="font-semibold text-sm">Paid</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    K{SINGLE_MIN}–K{SINGLE_MAX} per song. You earn on every purchase.
                  </p>
                </button>
              </div>
              {tier === "paid" && (
                <label className="block text-sm">
                  Price (ZMW)
                  <input
                    type="number"
                    min={SINGLE_MIN}
                    max={SINGLE_MAX}
                    step="1"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                  />
                  <span className="text-xs text-muted-foreground">
                    Must be K{SINGLE_MIN}–K{SINGLE_MAX}
                  </span>
                </label>
              )}
              {tier === "free" && (
                <label className="flex items-start gap-2 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={feeAgreed}
                    onChange={(e) => setFeeAgreed(e.target.checked)}
                  />
                  <span>
                    I agree to pay the <strong>K{FREE_SONG_FEE}</strong> maintenance fee when this
                    free song is approved. You'll be billed via the Payouts tab.
                  </span>
                </label>
              )}
            </>
          ) : (
            <label className="block text-sm">
              Album price (ZMW)
              <input
                type="number"
                min={ALBUM_MIN}
                max={ALBUM_MAX}
                step="1"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
              <span className="text-xs text-muted-foreground">
                Must be K{ALBUM_MIN}–K{ALBUM_MAX}. Each track inherits this price.
              </span>
            </label>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 rounded-full bg-secondary border border-border text-sm"
            >
              ← Back
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold disabled:opacity-40"
            >
              {busy ? "Uploading…" : mode === "album" ? "Submit album" : "Submit song"}
            </button>
          </div>
        </div>
      )}
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
