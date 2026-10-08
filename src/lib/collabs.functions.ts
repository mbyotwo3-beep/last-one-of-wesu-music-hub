import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "@/lib/roles";

/** Human labels for credit roles, shown to listeners on the song page. */
const CREDroleLabel: Record<string, string> = {
  featured: "Featuring",
  producer: "Produced by",
  writer: "Written by",
  remixer: "Remixed by",
  main: "Main artist",
};

/** Roles a plain, account-less credit may use. A feature is not one of them. */
export const NAME_ONLY_CREDIT_ROLES = ["producer", "writer", "remixer"] as const;

async function audit(
  actorId: string,
  action: string,
  target_type?: string,
  target_id?: string,
  meta: any = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("audit_log")
    .insert({ actor_id: actorId, action, target_type, target_id, meta });
}

export const inviteCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      song_id: string;
      artist_id: string;
      role: "main" | "featured" | "producer" | "writer" | "remixer";
      split_pct: number;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // SECURITY: Validate split percentage
    if (!Number.isFinite(data.split_pct) || data.split_pct < 0 || data.split_pct > 100) {
      throw new Error("split_pct must be between 0 and 100");
    }

    // SECURITY: only the song owner (or staff) may attach collaborators.
    const { data: song } = await supabaseAdmin
      .from("songs")
      .select("id, artist_id")
      .eq("id", data.song_id)
      .maybeSingle();
    if (!song) throw new Error("Song not found");
    const staff = await isStaffUser(supabase, userId);
    if (!staff) {
      const { data: artist } = await supabase
        .from("artists")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!artist || (artist as any).id !== (song as any).artist_id) {
        throw new Error("Forbidden: only the song owner can invite collaborators");
      }
    }

    // The invited artist must exist and be approved: a pending (or missing)
    // artist has no live profile, so the credit could never show and the
    // invite could never be meaningfully approved.
    const { data: target } = await supabaseAdmin
      .from("artists")
      .select("id, name, status, user_id")
      .eq("id", data.artist_id)
      .maybeSingle();
    if (!target) throw new Error("Artist not found");
    if ((target as any).status !== "approved") {
      throw new Error(
        `"${(target as any).name ?? "That artist"}" is not an approved artist yet — they need to apply first`,
      );
    }
    // No self-invites: crediting yourself creates a row that can never be
    // approved by anyone else and shows a phantom pending invite forever.
    if ((target as any).user_id === userId) {
      throw new Error("You can't invite yourself as a collaborator");
    }

    // SECURITY: total splits on a song must not exceed 100%.
    const { data: existing } = await supabaseAdmin
      .from("song_collaborators")
      .select("split_pct")
      .eq("song_id", data.song_id);
    const total = (existing ?? []).reduce((s: number, r: any) => s + Number(r.split_pct ?? 0), 0);
    if (total + data.split_pct > 100) {
      throw new Error(`Total splits would exceed 100% (currently ${total}%)`);
    }

    const { error } = await supabaseAdmin.from("song_collaborators").insert({
      song_id: data.song_id,
      artist_id: data.artist_id,
      role: data.role,
      split_pct: data.split_pct,
      invited_by: userId,
      accepted: false,
    } as any);
    if (error) {
      // Re-inviting the same artist hits the unique index — say so plainly
      // instead of leaking a constraint name.
      if (error.code === "23505") {
        throw new Error("That artist is already credited on this song");
      }
      throw new Error(error.message);
    }
    await audit(userId, "collab.invite", "song", data.song_id, {
      artist_id: data.artist_id,
      split: data.split_pct,
    });
    return { ok: true };
  });

export const respondToCollabInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; accept: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // SECURITY: only the invited artist, the inviter/song owner, or staff
    // may accept or decline an invite — previously any authed user could.
    const { data: invite } = await supabaseAdmin
      .from("song_collaborators")
      .select("id, artist_id, invited_by, songs!inner(id, artist_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!invite) throw new Error("Invite not found");
    const staff = await isStaffUser(supabase, userId);
    if (!staff && (invite as any).invited_by !== userId) {
      const { data: artist } = await supabase
        .from("artists")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      const songArtistId = (invite as any).songs?.artist_id;
      const isInvited = artist && (artist as any).id === (invite as any).artist_id;
      const isOwner = artist && (artist as any).id === songArtistId;
      if (!isInvited && !isOwner) {
        throw new Error("Forbidden: you cannot respond to this invite");
      }
    }

    if (data.accept) {
      const { error } = await supabaseAdmin
        .from("song_collaborators")
        .update({ accepted: true } as any)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      await supabaseAdmin.from("song_collaborators").delete().eq("id", data.id);
    }
    await audit(
      userId,
      data.accept ? "collab.accept" : "collab.decline",
      "song_collaborators",
      data.id,
    );
    return { ok: true };
  });

export const listMyCollabInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artist } = await context.supabase
      .from("artists")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!artist) return { incoming: [], outgoing: [] };
    const { data: incoming } = await context.supabase
      .from("song_collaborators")
      .select("id, role, split_pct, accepted, created_at, songs!inner(id, title, cover_url)")
      .eq("artist_id", (artist as any).id)
      .eq("accepted", false);
    const { data: outgoing } = await context.supabase
      .from("song_collaborators")
      .select(
        "id, role, split_pct, accepted, created_at, songs!inner(id, title, artist_id), artists!inner(id, name)",
      )
      .eq("invited_by", context.userId);
    return { incoming: incoming ?? [], outgoing: outgoing ?? [] };
  });

/**
 * Credits for one song, as shown to a listener.
 *
 * Two kinds of credit, and the difference is the point of the feature:
 *   - account credits ("featured", or any role that took a split) link to the
 *     person's artist page. A feature must be a real account — enforced by the
 *     database, not just here.
 *   - name-only credits (producer/writer/remixer with no account) show as a
 *     plain name. They never carry a share: split_pct is forced to 0 for them,
 *     so there is nothing to pay and nothing to leak.
 *
 * `split_pct` is deliberately NOT returned. It is read from a public view that
 * excludes it; financial terms are not something a listener should see, and
 * the view is the only thing an anonymous browser can read.
 */
export const listSongCollaborators = createServerFn({ method: "GET" })
  .validator((d: { song_id: string }) => d)
  .handler(async ({ data }) => {
    const { getPublicSupabase } = await import("@/lib/supabase-public.server");
    const sb = getPublicSupabase();

    // SECURITY: split_pct is not in this view by design.
    const select = (cols: string) =>
      sb.from("public_song_collaborators").select(cols).eq("song_id", data.song_id);
    const current = await select("id, role, accepted, created_at, song_id, artist_id, credit_name");
    let rows = current.data as any[] | null;
    if (current.error) {
      // A missing column (migration not applied yet) must not break the song
      // page — fall back to the pre-migration shape.
      const legacy = await select("id, role, accepted, created_at, song_id, artist_id");
      if (legacy.error) return [];
      rows = (legacy.data ?? []).map((r: any) => ({ ...r, credit_name: null }));
    }
    if (!rows) return [];

    // Artist details for account-backed credits only. A name-only credit has
    // no artist row, and `in()` with a null entry would be a wasted query.
    const artistIds = rows.map((r: any) => r.artist_id).filter((id: unknown): id is string => !!id);
    const { data: artists } = artistIds.length
      ? await sb.from("artists").select("id, name, avatar_url").in("id", artistIds)
      : { data: [] as any[] };

    // Combine the data
    return rows.map((row: any) => {
      const artist = (artists ?? []).find((a: any) => a.id === row.artist_id);
      return {
        id: row.id,
        role: row.role,
        // "featured" reads as a byline; the rest read as what they did.
        label: row.role === "featured" ? "Featuring" : (CREDroleLabel[row.role] ?? row.role),
        name: artist?.name ?? row.credit_name ?? null,
        avatarUrl: artist?.avatar_url ?? null,
        artistId: artist?.id ?? null,
        hasAccount: !!artist?.id,
      };
    });
  });

/**
 * Add a credit to a song.
 *
 * Two modes, decided by whether the other person has a Wesu account:
 *
 *   artist_id  → a real account. Can be a FEATURE, and can take a share of the
 *                song's earnings (split_pct, validated against the 100% total).
 *                The payout happens in the revenue-split trigger.
 *
 *   credit_name→ a plain collaborator with no account (producer, writer,
 *                remixer). Credit only: no share is stored, because there is no
 *                account to pay. A FEATURE cannot be done this way — the
 *                database rejects it, and so does this function.
 */
export const addSongCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      song_id: string;
      role: "main" | "featured" | "producer" | "writer" | "remixer";
      /** Present for an account credit. */
      artist_id?: string | null;
      /** Present for a name-only credit. */
      credit_name?: string | null;
      /** Share of the song's earnings, 0-100. Only meaningful with an account. */
      split_pct?: number | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const hasAccount = !!data.artist_id;
    const name = (data.credit_name ?? "").trim();

    if (!hasAccount && !name) {
      throw new Error("Add either an artist account or a name for the credit");
    }
    if (hasAccount && name) {
      throw new Error("A credit is either an account or a name, not both");
    }
    if (!hasAccount && (data.role === "featured" || data.role === "main")) {
      // A co-lead and a feature are both PERFORMANCES, so both need an account:
      // without one there is nothing to link to and nobody to pay. Producer /
      // writer / remixer are credits only, so a bare name is fine there.
      throw new Error(
        data.role === "main"
          ? "A co-lead artist needs their own Wesu account so the credit can link to their profile and receive their share"
          : "A featured artist needs their own Wesu account so the credit can link to their profile and receive their share",
      );
    }
    if (name && (name.length < 1 || name.length > 80)) {
      throw new Error("Name must be between 1 and 80 characters");
    }

    // SECURITY: validate the share. A name-only credit can never take money.
    const split = hasAccount ? Number(data.split_pct ?? 0) : 0;
    if (!Number.isFinite(split) || split < 0 || split > 100) {
      throw new Error("Share must be between 0 and 100");
    }
    if (!hasAccount && Number(data.split_pct ?? 0) !== 0) {
      throw new Error("Only an artist with an account can take a share of the earnings");
    }

    // SECURITY: only the song owner (or staff) may attach credits.
    const { data: song } = await supabaseAdmin
      .from("songs")
      .select("id, artist_id")
      .eq("id", data.song_id)
      .maybeSingle();
    if (!song) throw new Error("Song not found");
    const staff = await isStaffUser(supabase, userId);
    if (!staff) {
      const { data: artist } = await supabase
        .from("artists")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!artist || (artist as any).id !== (song as any).artist_id) {
        throw new Error("Forbidden: only the song owner can add credits");
      }
    }

    // SECURITY: total shares on a song must not exceed 100%.
    if (split > 0) {
      const { data: existing } = await supabaseAdmin
        .from("song_collaborators")
        .select("split_pct")
        .eq("song_id", data.song_id);
      const total = (existing ?? []).reduce((s: number, r: any) => s + Number(r.split_pct ?? 0), 0);
      if (total + split > 100) {
        throw new Error(`Total shares would exceed 100% (currently ${total}%)`);
      }
    }

    // An account credit is an invitation the other person must accept; a
    // name-only credit has nobody to ask, so it is live immediately.
    const row = {
      song_id: data.song_id,
      artist_id: hasAccount ? data.artist_id : null,
      credit_name: hasAccount ? null : name,
      role: data.role,
      split_pct: split,
      invited_by: userId,
      accepted: hasAccount ? false : true,
    } as any;

    const { error } = await supabaseAdmin.from("song_collaborators").insert(row);
    if (error) {
      if (error.code === "23505") {
        throw new Error("That person is already credited on this song");
      }
      throw new Error(error.message);
    }
    await audit(userId, "collab.add_credit", "song", data.song_id, {
      role: data.role,
      artist_id: data.artist_id ?? null,
      credit_name: hasAccount ? null : name,
      split_pct: split,
    });
    return { ok: true };
  });

export const removeCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // SECURITY: only the song owner, the inviter, or staff may remove a
    // collaborator — previously any authed user could delete any row.
    const { data: row } = await supabaseAdmin
      .from("song_collaborators")
      .select("id, artist_id, invited_by, songs!inner(id, artist_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Collaborator not found");
    const staff = await isStaffUser(supabase, userId);
    if (!staff && (row as any).invited_by !== userId) {
      const { data: artist } = await supabase
        .from("artists")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      const owned =
        artist &&
        ((artist as any).id === (row as any).artist_id ||
          (artist as any).id === (row as any).songs?.artist_id);
      if (!owned) throw new Error("Forbidden: you cannot remove this collaborator");
    }

    const { error } = await supabaseAdmin.from("song_collaborators").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "collab.remove", "song_collaborators", data.id);
    return { ok: true };
  });
