import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "@/lib/roles";

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
      role: "featured" | "producer" | "writer" | "remixer";
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
    if (error) throw new Error(error.message);
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

export const listSongCollaborators = createServerFn({ method: "GET" })
  .validator((d: { song_id: string }) => d)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // SECURITY: Don't expose split_pct to public queries
    // Use the public view which excludes financial data
    const { data: rows } = await sb
      .from("public_song_collaborators")
      .select("id, role, accepted, created_at, song_id, artist_id")
      .eq("song_id", data.song_id);

    if (!rows) return [];

    // Fetch artist details separately
    const artistIds = rows.map((r: any) => r.artist_id);
    const { data: artists } = await sb
      .from("artists")
      .select("id, name, avatar_url")
      .in("id", artistIds);

    // Combine the data
    const result = rows.map((row: any) => {
      const artist = (artists ?? []).find((a: any) => a.id === row.artist_id);
      return {
        id: row.id,
        role: row.role,
        accepted: row.accepted,
        artists: artist ? [artist] : [],
      };
    });

    return result;
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
