import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { CreditCard, Smartphone, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getPaymentMethods, getPurchasableItem } from "@/lib/music.functions";
import { initiatePayment, getPlaylistCheckout, initiatePlaylistUnlock } from "@/lib/payments.functions";
import { useAuth } from "@/hooks/use-auth";
import { StorageImage } from "@/components/StorageImage";

const methodsQO = queryOptions({ queryKey: ["methods"], queryFn: () => getPaymentMethods() });

type CheckoutSearch = {
  item?: "song" | "album" | "playlist";
  id?: string;
};

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Wesu+" },
      { name: "description", content: "Complete your purchase on Wesu+." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): CheckoutSearch => {
    const item = s.item === "song" || s.item === "album" || s.item === "playlist" ? s.item : undefined;
    const out: CheckoutSearch = {};
    if (item) out.item = item;
    if (typeof s.id === "string") out.id = s.id;
    return out;
  },
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(methodsQO);
  },
  component: CheckoutRoute,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function CheckoutRoute() {
  const [isMounted, setIsMounted] = useState(false);
  const search = Route.useSearch();
  const isStatusPage = useRouterState({
    select: (state) => state.location.pathname === "/checkout/success",
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // The status route is nested beneath `/checkout` but only receives a ref.
  // Render it before checking the checkout item's query parameters.
  if (isStatusPage) return <Outlet />;

  // Subscriptions are temporarily disabled — only track/album purchases are supported.
  // Keep every hook above this guard so hydration cannot change hook order.
  if (!isMounted) return null;
  if (!search.item || !search.id) return <MissingCheckout />;
  if (search.item === "playlist") return <PlaylistCheckoutPage playlistId={search.id} />;
  return <CheckoutPage />;
}

function MissingCheckout() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">Choose a song or album to buy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This checkout link is incomplete. Your payment has not been started.
        </p>
        <Link
          to="/browse"
          className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
        >
          Browse Music
        </Link>
      </div>
    </div>
  );
}

function CheckoutPage() {
  const search = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: methods } = useSuspenseQuery(methodsQO);

  const { data: purchasable, isLoading: purchasableLoading } = useQuery({
    queryKey: ["purchasable", search.item, search.id],
    queryFn: () => getPurchasableItem({ data: { item_type: search.item!, id: search.id! } }),
    enabled: !!search.item && !!search.id,
  });

  const [selectedMethodCode, setSelectedMethodCode] = useState(methods[0]?.code ?? "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user)
      navigate({
        to: "/auth",
        search: { redirect: window.location.pathname + window.location.search },
      });
  }, [user, loading, navigate]);

  const payFn = useServerFn(initiatePayment);
  const mutation = useMutation({
    mutationFn: payFn,
    onSuccess: (res: any) => {
      if (res?.paymentUrl) {
        // Card / hosted checkout — redirect to Lenco
        window.location.href = res.paymentUrl;
        return;
      }
      if (res?.widget) {
        // Card via Lenco's hosted inline widget (account not enabled for
        // server-side direct card collections).
        import("@/lib/lenco-widget")
          .then(({ openLencoCardWidget }) =>
            openLencoCardWidget(res.widget, {
              onSuccess: () =>
                navigate({ to: "/checkout/success", search: { ref: res.transactionId } }),
              onPending: () =>
                navigate({ to: "/checkout/success", search: { ref: res.transactionId } }),
              onClose: () => toast.info("Card payment cancelled."),
            }),
          )
          .catch((err: Error) => {
            setResultMsg(err.message);
            toast.error(`Payment failed: ${err.message}`);
          });
        return;
      }
      if (res?.transactionId) {
        // Mobile money — redirect to success page to poll for status
        navigate({ to: "/checkout/success", search: { ref: res.transactionId } });
        return;
      }
      const successMsg = res?.message ?? "Payment started.";
      setResultMsg(successMsg);
      toast.success(successMsg);
    },
    onError: (e: Error) => {
      setResultMsg(e.message);
      toast.error(`Payment failed: ${e.message}`);
    },
  });

  if (loading || !user) return null;

  if (purchasableLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading item…</div>;
  }

  // Item resolved to null: unapproved / removed / wrong id. Never hang on
  // "Loading…" and never offer to pay for it.
  if (!purchasable) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold">This item isn't available for purchase</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been removed or is still awaiting approval.
          </p>
          <Link
            to="/browse"
            className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
          >
            Browse Music
          </Link>
        </div>
      </div>
    );
  }

  // Resolve line item
  const lineName = `${(purchasable as any).title}${(purchasable as any).artist?.name ? ` — ${(purchasable as any).artist.name}` : ""}`;
  const linePrice = Number((purchasable as any).price ?? 0);
  const itemType: "song" | "album" = search.item!;
  const itemId: string | undefined = (purchasable as any).id;
  const isFree = linePrice <= 0;

  const selectedMethod = methods.find((m) => m.code === selectedMethodCode);
  const isCard = selectedMethod?.category === "card";
  // Zambian mobile-money numbers: exactly 10 digits starting 05/07/09
  // (spaces/dashes allowed). Invalid numbers burn a failed STK attempt
  // server-side, so validate here with an inline hint.
  const normalizedPhone = phoneNumber.replace(/[\s-]/g, "");
  const phoneValid = /^0[579]\d{8}$/.test(normalizedPhone);
  const disabled =
    mutation.isPending ||
    !selectedMethodCode ||
    !itemId ||
    (!isCard && !phoneValid) ||
    isFree;

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Checkout</h1>
        <p className="text-muted-foreground mb-8">Complete your purchase securely</p>

        <div className="bg-card border border-white/5 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
          <div className="flex justify-between items-center py-3 border-b border-white/5">
            <span className="text-muted-foreground">{lineName}</span>
            <span className="font-semibold">ZMW {linePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center py-3">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold text-primary">ZMW {linePrice.toFixed(2)}</span>
          </div>
        </div>

        {methods.length === 0 && (
          <div className="bg-card border border-amber-500/30 rounded-2xl p-6 mb-8 text-sm text-amber-300">
            No payment methods are available right now. Please try again later or contact
            support.
          </div>
        )}

        {isFree && (
          <div className="bg-card border border-primary/30 rounded-2xl p-6 mb-8 text-sm">
            This item is free — no payment needed. Find it in your library.
          </div>
        )}

        <div className="bg-card border border-white/5 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Payment Method</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {methods.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMethodCode(m.code)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedMethodCode === m.code
                    ? "border-primary bg-primary/10"
                    : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  {m.category === "card" ? (
                    <CreditCard className="size-5" />
                  ) : (
                    <Smartphone className="size-5" />
                  )}
                  <span className="font-medium text-sm">{m.label}</span>
                </div>
              </button>
            ))}
          </div>

          {!isCard ? (
            <div className="space-y-4">
              <label className="block text-sm font-medium">Mobile Money Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 0977 123 456"
                className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
              />
              <p className="text-xs text-muted-foreground">
                {phoneNumber.trim() && !phoneValid
                  ? "Enter a 10-digit Zambian number starting 095, 096, 097, 075, 076 or 077."
                  : "You'll receive a prompt on your phone to authorize this payment."}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Card payments are processed securely by Lenco. You'll be redirected after confirming.
            </p>
          )}
        </div>

        {resultMsg && (
          <div className="mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            {resultMsg}
          </div>
        )}

        <button
          disabled={disabled}
          onClick={() =>
            mutation.mutate({
              data: {
                method_code: selectedMethodCode,
                item_type: itemType,
                item_id: itemId!,
                phone: normalizedPhone || undefined,
              },
            })
          }
          className="w-full py-4 bg-primary text-obsidian rounded-2xl font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer hover:scale-105"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Pay ZMW {linePrice.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

/**
 * Shared-playlist unlock checkout: ONE payment for every song in the
 * playlist the buyer doesn't own yet. Amounts come from the server —
 * fulfilment fans the bundle out into one purchase per song.
 */
function PlaylistCheckoutPage({ playlistId }: { playlistId: string }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: methods } = useSuspenseQuery(methodsQO);
  const bundleFn = useServerFn(getPlaylistCheckout);
  const unlockFn = useServerFn(initiatePlaylistUnlock);

  const { data: bundle, isLoading: bundleLoading } = useQuery({
    queryKey: ["playlist-checkout", playlistId],
    queryFn: () => bundleFn({ data: { playlist_id: playlistId } }),
    staleTime: 30_000,
  });

  const [selectedMethodCode, setSelectedMethodCode] = useState(methods[0]?.code ?? "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user)
      navigate({
        to: "/auth",
        search: { redirect: window.location.pathname + window.location.search },
      });
  }, [user, loading, navigate]);

  const mutation = useMutation({
    mutationFn: unlockFn,
    onSuccess: (res: any) => {
      if (res?.paymentUrl) {
        window.location.href = res.paymentUrl;
        return;
      }
      if (res?.widget) {
        import("@/lib/lenco-widget")
          .then(({ openLencoCardWidget }) =>
            openLencoCardWidget(res.widget, {
              onSuccess: () =>
                navigate({ to: "/checkout/success", search: { ref: res.transactionId } }),
              onPending: () =>
                navigate({ to: "/checkout/success", search: { ref: res.transactionId } }),
              onClose: () => toast.info("Card payment cancelled."),
            }),
          )
          .catch((err: Error) => {
            setResultMsg(err.message);
            toast.error(`Payment failed: ${err.message}`);
          });
        return;
      }
      if (res?.transactionId) {
        navigate({ to: "/checkout/success", search: { ref: res.transactionId } });
        return;
      }
      const successMsg = res?.message ?? "Payment started.";
      setResultMsg(successMsg);
      toast.success(successMsg);
    },
    onError: (e: Error) => {
      setResultMsg(e.message);
      toast.error(`Payment failed: ${e.message}`);
    },
  });

  if (loading || !user) return null;
  if (bundleLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading bundle…</div>;
  }
  if (!bundle) {
    return <div className="p-12 text-center text-muted-foreground">Playlist not found.</div>;
  }
  if (bundle.unlocked) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold">Already unlocked</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You own everything in "{bundle.playlist_name}" — no payment needed.
          </p>
          <Link
            to="/playlists/$id"
            params={{ id: playlistId }}
            className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
          >
            Open playlist
          </Link>
        </div>
      </div>
    );
  }

  const missing = bundle.missing ?? [];
  const total = Number(bundle.total ?? 0);
  const selectedMethod = methods.find((m) => m.code === selectedMethodCode);
  const isCard = selectedMethod?.category === "card";
  const normalizedPhone = phoneNumber.replace(/[\s-]/g, "");
  const phoneValid = /^0[579]\d{8}$/.test(normalizedPhone);
  const disabled =
    mutation.isPending || !selectedMethodCode || (!isCard && !phoneValid);

  if (missing.length === 0) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold">Nothing to pay</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every song in "{bundle.playlist_name}" is free or already yours.
          </p>
          <Link
            to="/playlists/$id"
            params={{ id: playlistId }}
            className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
          >
            Open playlist
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Unlock playlist</h1>
        <p className="text-muted-foreground mb-8">
          One payment unlocks every song below in "{bundle.playlist_name}" — free songs and
          tracks you already own are never charged.
        </p>

        <div className="bg-card border border-white/5 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            {missing.length} song{missing.length === 1 ? "" : "s"} to unlock
          </h2>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {missing.map((s: any) => (
              <div key={s.song_id} className="flex items-center gap-3">
                <StorageImage
                  bucket="album-art"
                  path={s.cover_url}
                  alt={s.title}
                  className="size-10 rounded-lg object-cover bg-muted shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.artist_name}</p>
                </div>
                <span className="text-sm font-semibold shrink-0">
                  ZMW {Number(s.price).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center py-3 mt-2 border-t border-white/5">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold text-primary">ZMW {total.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-card border border-white/5 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Payment Method</h2>
          {methods.length === 0 ? (
            <p className="text-sm text-amber-300">
              No payment methods are available right now. Please try again later.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMethodCode(m.code)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedMethodCode === m.code
                        ? "border-primary bg-primary/10"
                        : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {m.category === "card" ? (
                        <CreditCard className="size-5" />
                      ) : (
                        <Smartphone className="size-5" />
                      )}
                      <span className="font-medium text-sm">{m.label}</span>
                    </div>
                  </button>
                ))}
              </div>
              {!isCard ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium">Mobile Money Number</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="e.g. 0977 123 456"
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    {phoneNumber.trim() && !phoneValid
                      ? "Enter a 10-digit Zambian number starting 095, 096, 097, 075, 076 or 077."
                      : "You'll receive a prompt on your phone to authorize this payment."}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Card payments are processed securely by Lenco. You'll be redirected after
                  confirming.
                </p>
              )}
            </>
          )}
        </div>

        {resultMsg && (
          <div className="mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            {resultMsg}
          </div>
        )}

        <button
          disabled={disabled}
          onClick={() =>
            mutation.mutate({
              data: {
                method_code: selectedMethodCode,
                playlist_id: playlistId,
                phone: normalizedPhone || undefined,
              },
            })
          }
          className="w-full py-4 bg-primary text-obsidian rounded-2xl font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer hover:scale-105"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Pay ZMW {total.toFixed(2)}
        </button>
      </div>
    </div>
  );
}
