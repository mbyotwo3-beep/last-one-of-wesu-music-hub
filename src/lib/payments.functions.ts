import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computePlaylistMissing, type PlaylistMissingSong } from "@/lib/listener.functions";

type PurchaseItemType = "song" | "album";

/**
 * Resume an existing open transaction, re-driving the provider if it never
 * started.
 *
 * A pending row with no `provider_token` never reached the provider — the
 * server died between the insert and `startCollectionForTx`, or the attempt
 * failed before its response was recorded. Returning the bare id to the client
 * handed back a transaction that could never settle: it polled a collection
 * that did not exist, forever, with no money taken and no way for the buyer to
 * recover. So re-drive it here. The reference is the transaction id, so a
 * provider that already has this reference rejects the duplicate rather than
 * charging twice.
 */
async function resumeOrRedriveCollection(args: {
  supabaseAdmin: any;
  openRow: any;
  methodCode: string;
  phone?: string;
  email?: string | null;
}): Promise<{ transactionId: string; resumed: true }> {
  const { supabaseAdmin, openRow, methodCode } = args;
  if (!openRow.provider_token) {
    const { data: method } = await supabaseAdmin
      .from("payment_methods")
      .select("code,category,lenco_operator,is_enabled")
      .eq("code", methodCode)
      .maybeSingle();
    if (method && (method as any).is_enabled !== false) {
      const { getSiteConfigServer } = await import("@/lib/pricing.functions");
      const siteConfig = await getSiteConfigServer();
      try {
        return (await startCollectionForTx({
          txId: openRow.id,
          amount: Number(openRow.amount),
          itemLabel: `Wesu+ ${openRow.item_type}`,
          method: method as any,
          phone: args.phone ?? (openRow.metadata?.phone as string | undefined),
          email:
            args.email ??
            (openRow.metadata?.email as string | undefined) ??
            siteConfig.support_email,
          appUrl: process.env.APP_URL ?? siteConfig.url,
        })) as any;
      } catch {
        // Fall through to the plain resume so the buyer still sees their
        // order instead of an exception.
      }
    }
  }
  return { transactionId: openRow.id, resumed: true };
}

/**
 * Does this buyer already own this item?
 *
 * Mirrors the fulfilment rule exactly, so the answer the buyer gets at
 * checkout is the same answer that would have been reached after paying:
 *   - a free item needs nothing bought,
 *   - a single song is owned via a completed `purchases` row,
 *   - an album is owned when every track on it is owned.
 */
export async function alreadyOwnsItem(
  supabase: { from: (t: string) => any },
  userId: string,
  itemType: PurchaseItemType,
  itemId: string,
): Promise<boolean> {
  if (itemType === "song") {
    const { data: song } = await supabase
      .from("songs")
      .select("id,price")
      .eq("id", itemId)
      .maybeSingle();
    // Free tracks are always playable, so there is nothing to buy.
    if (Number(song?.price ?? 0) <= 0) return true;
    const { data: owned } = await supabase
      .from("purchases")
      .select("id")
      .eq("user_id", userId)
      .eq("song_id", itemId)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    return !!owned;
  }

  // Album: every track must be owned. A partially-owned album is still
  // purchasable — the tracks they are missing are what they are buying.
  const { data: tracks } = await supabase
    .from("songs")
    .select("id,price")
    .eq("album_id", itemId)
    .eq("status", "approved");
  const payable = (tracks ?? []).filter((t: any) => Number(t.price ?? 0) > 0);
  if (payable.length === 0) return true;
  const { data: ownedRows } = await supabase
    .from("purchases")
    .select("song_id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in(
      "song_id",
      payable.map((t: any) => t.id),
    );
  const ownedIds = new Set((ownedRows ?? []).map((r: any) => r.song_id));
  return payable.every((t: any) => ownedIds.has(t.id));
}

function validateTransactionId(input: unknown): { transactionId: string } {
  if (!input || typeof input !== "object") throw new Error("Invalid payment request");
  const transactionId = (input as Record<string, unknown>).transactionId;
  if (typeof transactionId !== "string" || !transactionId.trim()) {
    throw new Error("transactionId is required");
  }
  return { transactionId: transactionId.trim() };
}

function validatePaymentRequest(input: unknown): {
  method_code: string;
  item_type: PurchaseItemType;
  item_id: string;
  phone?: string;
} {
  if (!input || typeof input !== "object") throw new Error("Invalid payment request");
  const value = input as Record<string, unknown>;
  if (typeof value.method_code !== "string" || !value.method_code.trim()) {
    throw new Error("method_code is required");
  }
  if (value.item_type !== "song" && value.item_type !== "album") {
    throw new Error("Only songs and albums can be purchased at this time");
  }
  if (typeof value.item_id !== "string" || !value.item_id.trim()) {
    throw new Error("item_id is required");
  }
  if (value.phone !== undefined && typeof value.phone !== "string") {
    throw new Error("phone must be a string");
  }
  return {
    method_code: value.method_code.trim(),
    item_type: value.item_type,
    item_id: value.item_id.trim(),
    phone: value.phone?.trim() || undefined,
  };
}

/**
 * Poll Lenco for the authoritative state of one of the caller's own
 * transactions and settle it. This is the fallback (and, in practice, the
 * primary) completion path for mobile money: the customer approves the USSD
 * prompt on their phone and the checkout page verifies the result directly
 * instead of waiting on webhook delivery.
 */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateTransactionId)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", data.transactionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!tx) return { status: "not_found" as const };
    if (tx.status === "completed" || tx.status === "failed") {
      return { status: tx.status as string, transaction: tx };
    }

    // A completed mobile-money collection can occasionally lose the server
    // request between entitlement creation and the final ledger update. Let a
    // subsequent status poll safely resume that recovery path.
    if (
      tx.status !== "pending" &&
      tx.status !== "fulfillment_failed" &&
      tx.status !== "processing"
    ) {
      return { status: tx.status as string, transaction: tx };
    }

    const { getCollectionStatus } = await import("@/lib/lenco.server");
    const remote = await getCollectionStatus(tx.id, (tx as any).provider_token);

    if (!remote) return { status: "pending" as const, transaction: tx };

    const s = (remote.status ?? "").toLowerCase();
    const isSuccess = s === "successful" || s === "success" || s === "completed";
    const isFailure = s === "failed" || s === "declined" || s === "cancelled";

    if (!isSuccess && !isFailure) {
      return { status: "pending" as const, transaction: tx, reason: remote.reasonForFailure };
    }

    const { settleTransaction } = await import("@/lib/payments.server");
    const settled = await settleTransaction(
      tx.id,
      isSuccess ? "successful" : "failed",
      remote.id ?? null,
      isFailure ? remote.reasonForFailure : null,
    );

    const { data: fresh } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", tx.id)
      .maybeSingle();

    return { status: settled, transaction: fresh ?? tx, reason: remote.reasonForFailure };
  });

/**
 * Start the Lenco collection for an already-recorded pending transaction.
 * Shared by single-item checkout and playlist-unlock bundles so both flows
 * behave identically (mobile USSD prompt, hosted card URL, widget fallback).
 */
async function startCollectionForTx(args: {
  txId: string;
  amount: number;
  itemLabel: string;
  method: { code: string; category: string; lenco_operator?: string | null };
  phone?: string;
  email: string;
  appUrl: string;
}): Promise<
  | { transactionId: string; pendingUssd: true; message: string }
  | { transactionId: string; paymentUrl: string }
  | { transactionId: string; widget: Record<string, unknown> }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { initiateMobileMoney, initiateCardCheckout, normalizeLencoOperator, normalizeZmPhone } =
    await import("@/lib/lenco.server");
  const isMobile = (args.method as any).category === "mobile_money";

  if (isMobile) {
    try {
      const result = await initiateMobileMoney({
        amount: args.amount,
        reference: args.txId,
        operator: normalizeLencoOperator((args.method as any).lenco_operator),
        phone: normalizeZmPhone(args.phone!),
        narration: args.itemLabel,
      });
      await supabaseAdmin
        .from("payment_transactions")
        .update({ provider_token: result.id, provider_ref: result.reference } as any)
        .eq("id", args.txId);
      return {
        transactionId: args.txId,
        pendingUssd: true as const,
        message: "Check your phone and approve the payment prompt to complete this purchase.",
      };
    } catch (e: any) {
      // Do NOT mark this failed. A timeout here is ambiguous: the prompt may
      // already be sitting on the buyer's phone, still approvable. Marking it
      // failed made the retry open a SECOND collection, so the buyer could
      // approve two prompts and be debited twice for one track. Leave it
      // pending, record why, and let the status lookup discover the truth.
      const raw = e?.message ?? "Unable to start payment";
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: current } = await supabaseAdmin
          .from("payment_transactions")
          .select("metadata")
          .eq("id", args.txId)
          .maybeSingle();
        await supabaseAdmin
          .from("payment_transactions")
          .update({
            metadata: {
              ...((current as any)?.metadata ?? {}),
              initiate_error: raw,
              // Distinguishes "never pushed" from "pushed but we lost the
              // reply", which decides whether a resume may re-drive it.
              initiate_at: new Date().toISOString(),
            },
          } as any)
          .eq("id", args.txId);
      } catch (persistErr) {
        console.error("[payments] could not record initiate_error", args.txId, persistErr);
      }
      console.error("[payments] mobile money initiate failed", args.txId, raw);
      const { friendlyPaymentError } = await import("@/lib/payment-errors");
      throw new Error(friendlyPaymentError(raw));
    }
  }

  // Card
  try {
    const result = await initiateCardCheckout({
      amount: args.amount,
      reference: args.txId,
      email: args.email,
      redirectUrl: `${args.appUrl}/checkout/success?ref=${args.txId}`,
      narration: args.itemLabel,
    });
    await supabaseAdmin
      .from("payment_transactions")
      .update({ provider_token: result.id, provider_ref: result.reference } as any)
      .eq("id", args.txId);
    return {
      transactionId: args.txId,
      paymentUrl: result.checkoutUrl,
    };
  } catch (e: any) {
    // Most Lenco accounts are not enabled for server-side direct card
    // collections ("The API key does not have permission to initiate direct
    // card collections"). Fall back to Lenco's hosted inline widget, which
    // only needs the publishable key. Fulfilment still happens by webhook.
    const publicKey = process.env.LENCO_PUBLIC_KEY;
    if (publicKey) {
      console.warn(`[Lenco] direct card unavailable, using inline widget: ${e?.message}`);
      return {
        transactionId: args.txId,
        widget: {
          publicKey,
          reference: args.txId,
          amount: args.amount,
          currency: "ZMW",
          email: args.email,
        },
      };
    }
    const { settleTransaction } = await import("@/lib/payments.server");
    await settleTransaction(args.txId, "failed", null, e?.message ?? "Unable to start payment");
    throw new Error(e?.message ?? "Failed to start card payment");
  }
}

/**
 * Initiate a Lenco collection.
 *
 * - Looks up the authoritative price server-side (never trusts client amount).
 * - Records a pending `payment_transactions` row.
 * - Routes to Lenco mobile-money or card checkout based on the selected method.
 * - Returns either `paymentUrl` (card, hosted redirect) or `pendingUssd: true`
 *   (mobile money — user completes on their phone; webhook fulfills).
 *
 * Required env vars: LENCO_SECRET_KEY, LENCO_WEBHOOK_SECRET, APP_URL (optional).
 */
export const initiatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validatePaymentRequest)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    // -- Authoritative price lookup (RLS-safe: uses caller's client) --
    let authoritativeAmount: number | null = null;
    if (data.item_type === "song") {
      const { data: row } = await supabase
        .from("songs")
        .select("price,title")
        .eq("id", data.item_id)
        .maybeSingle();
      authoritativeAmount = row?.price != null ? Number(row.price) : null;
    } else if (data.item_type === "album") {
      const { data: row } = await supabase
        .from("albums")
        .select("price,title")
        .eq("id", data.item_id)
        .maybeSingle();
      authoritativeAmount = row?.price != null ? Number(row.price) : null;
    }
    if (
      authoritativeAmount == null ||
      !Number.isFinite(authoritativeAmount) ||
      authoritativeAmount <= 0
    ) {
      throw new Error("Unable to determine price for the requested item");
    }
    const amount = authoritativeAmount;

    // -- Look up the payment method (Lenco operator or card) --
    const { data: method } = await supabase
      .from("payment_methods")
      .select("code,category,lenco_operator,is_enabled")
      .eq("code", data.method_code)
      .maybeSingle();
    if (!method || (method as any).is_enabled === false) {
      throw new Error("Selected payment method is not available");
    }
    const isMobile = (method as any).category === "mobile_money";
    const isCard = (method as any).category === "card";
    if (!isMobile && !isCard) throw new Error("Unsupported payment method category");
    if (isMobile && !(method as any).lenco_operator) {
      throw new Error("Payment method is not mapped to a Lenco operator");
    }
    if (isMobile && !data.phone) {
      throw new Error("Phone number is required for mobile money");
    }
    // Validate the MSISDN BEFORE recording a transaction. Previously the only
    // check was "is it present" and the real validation ran inside
    // startCollectionForTx — after the pending row was written — so a typo
    // burned a real STK attempt and left an orphan pending row behind.
    let phone: string | undefined;
    if (isMobile) {
      const { normalizeZmPhone } = await import("@/lib/lenco.server");
      phone = normalizeZmPhone(data.phone!);
    }

    // Never let a buyer pay twice for something they already own. Fulfilment
    // keys its idempotency on the transaction, so a second purchase of an
    // owned track would insert another `purchases` row AND fire the revenue
    // trigger again: the buyer is debited twice and the artist is paid twice.
    if (await alreadyOwnsItem(supabase, userId, data.item_type, data.item_id)) {
      return { alreadyOwned: true, transactionId: null } as any;
    }

    // -- Idempotency: double-clicks/retries within 5 minutes reuse the open
    // transaction instead of creating duplicate payable pendings. Applies to
    // card too: the client routes a resumed transactionId to the success
    // poller, which settles via webhook/Lenco status lookup.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: open } = await supabaseAdmin
        .from("payment_transactions")
        .select("*")
        .eq("user_id", userId)
        .eq("item_type", data.item_type)
        .eq("item_id", data.item_id)
        .eq("method_code", data.method_code)
        .in("status", ["pending", "processing", "fulfillment_failed"])
        .gte("created_at", fiveMinAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open)
        return resumeOrRedriveCollection({
          supabaseAdmin,
          openRow: open,
          methodCode: data.method_code,
          phone,
          email: (claims?.email as string | undefined) ?? null,
        });
    }

    // -- Record the pending transaction --
    // Card email is persisted so staff reconciliation always shows the buyer.
    const cardEmail = (claims?.email as string | undefined) ?? null;
    const { data: tx, error: insertError } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        user_id: userId,
        amount,
        currency: "ZMW",
        method_code: data.method_code,
        provider: "lenco",
        status: "pending",
        item_type: data.item_type,
        item_id: data.item_id,
        metadata: { phone: data.phone ?? null, email: cardEmail },
      })
      .select()
      .single();
    if (insertError || !tx) throw new Error(insertError?.message ?? "Insert failed");

    const { getSiteConfigServer } = await import("@/lib/pricing.functions");
    const siteConfig = await getSiteConfigServer();
    const appUrl = process.env.APP_URL ?? siteConfig.url;
    const email = (claims?.email as string | undefined) ?? siteConfig.support_email;

    return startCollectionForTx({
      txId: tx.id,
      amount,
      itemLabel: `Wesu+ ${data.item_type}`,
      method: method as any,
      phone: data.phone,
      email,
      appUrl,
    });
  });

// ---------- Shared-playlist unlock bundles ----------

export interface PlaylistBundleCheckout {
  playlist_id: string;
  playlist_name: string;
  isOwner: boolean;
  unlocked: boolean;
  missing: PlaylistMissingSong[];
  total: number;
}

/**
 * What a signed-in listener still needs to buy to fully play a playlist
 * shared with them. Owners (and staff) never see a bundle.
 */
export const getPlaylistCheckout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string }) => d)
  .handler(async ({ context, data }): Promise<PlaylistBundleCheckout> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isStaffUser } = await import("@/lib/roles");
    const staff = await isStaffUser(context.supabase, context.userId);
    const { playlist, isOwner, missing, total } = await computePlaylistMissing(
      supabaseAdmin,
      context.userId,
      data.playlist_id,
    );
    if (isOwner || staff) {
      return {
        playlist_id: playlist.id,
        playlist_name: playlist.name,
        isOwner,
        unlocked: true,
        missing: [],
        total: 0,
      };
    }
    return {
      playlist_id: playlist.id,
      playlist_name: playlist.name,
      isOwner: false,
      unlocked: missing.length === 0,
      missing,
      total,
    };
  });

function validateUnlockRequest(input: unknown): {
  method_code: string;
  playlist_id: string;
  phone?: string;
} {
  if (!input || typeof input !== "object") throw new Error("Invalid unlock request");
  const value = input as Record<string, unknown>;
  if (typeof value.method_code !== "string" || !value.method_code.trim()) {
    throw new Error("method_code is required");
  }
  if (typeof value.playlist_id !== "string" || !value.playlist_id.trim()) {
    throw new Error("playlist_id is required");
  }
  if (value.phone !== undefined && typeof value.phone !== "string") {
    throw new Error("phone must be a string");
  }
  return {
    method_code: value.method_code.trim(),
    playlist_id: value.playlist_id.trim(),
    phone: (value.phone as string | undefined)?.trim() || undefined,
  };
}

/**
 * One payment for every not-yet-owned paid song in a shared playlist.
 * The total is computed server-side from the same ownership rules as the
 * unlock panel — the client never supplies amounts. Fulfilment fans the
 * bundle out into one completed purchase per song.
 */
export const initiatePlaylistUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateUnlockRequest)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Recompute at pay time — never trust the client's song list or total.
    const { playlist, isOwner, missing, total } = await computePlaylistMissing(
      supabaseAdmin,
      userId,
      data.playlist_id,
    );
    if (isOwner) throw new Error("You own this playlist — no unlock needed");
    if (missing.length === 0 || !(total > 0)) {
      throw new Error("Nothing left to unlock on this playlist");
    }

    const { data: method } = await supabase
      .from("payment_methods")
      .select("code,category,lenco_operator,is_enabled")
      .eq("code", data.method_code)
      .maybeSingle();
    if (!method || (method as any).is_enabled === false) {
      throw new Error("Selected payment method is not available");
    }
    const isMobile = (method as any).category === "mobile_money";
    const isCard = (method as any).category === "card";
    if (!isMobile && !isCard) throw new Error("Unsupported payment method category");
    if (isMobile && !(method as any).lenco_operator) {
      throw new Error("Payment method is not mapped to a Lenco operator");
    }
    if (isMobile && !data.phone) {
      throw new Error("Phone number is required for mobile money");
    }
    // Validate the MSISDN before recording anything, so a typo cannot burn a
    // real STK attempt and leave an orphan pending row behind.
    let phone: string | undefined;
    if (isMobile) {
      const { normalizeZmPhone } = await import("@/lib/lenco.server");
      phone = normalizeZmPhone(data.phone!);
    }

    // Idempotency: same user + playlist + open row within 5 minutes reuses.
    {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: open } = await supabaseAdmin
        .from("payment_transactions")
        .select("*")
        .eq("user_id", userId)
        .eq("item_type", "playlist")
        .eq("item_id", playlist.id)
        .eq("method_code", data.method_code)
        .in("status", ["pending", "processing", "fulfillment_failed"])
        .gte("created_at", fiveMinAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open)
        return resumeOrRedriveCollection({
          supabaseAdmin,
          openRow: open,
          methodCode: data.method_code,
          phone,
          email: (claims?.email as string | undefined) ?? null,
        });
    }

    const cardEmail = (claims?.email as string | undefined) ?? null;
    const { data: tx, error: insertError } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        user_id: userId,
        amount: total,
        currency: "ZMW",
        method_code: data.method_code,
        provider: "lenco",
        status: "pending",
        item_type: "playlist",
        item_id: playlist.id,
        metadata: {
          phone: data.phone ?? null,
          email: cardEmail,
          playlist_id: playlist.id,
          songs: missing.map((m) => ({ song_id: m.song_id, amount: m.price })),
        },
      })
      .select()
      .single();
    if (insertError || !tx) throw new Error(insertError?.message ?? "Insert failed");

    const { getSiteConfigServer } = await import("@/lib/pricing.functions");
    const siteConfig = await getSiteConfigServer();
    const appUrl = process.env.APP_URL ?? siteConfig.url;
    const email = (claims?.email as string | undefined) ?? siteConfig.support_email;

    return startCollectionForTx({
      txId: tx.id,
      amount: total,
      itemLabel: `Wesu+ playlist unlock (${missing.length} songs)`,
      method: method as any,
      phone: data.phone,
      email,
      appUrl,
    });
  });
