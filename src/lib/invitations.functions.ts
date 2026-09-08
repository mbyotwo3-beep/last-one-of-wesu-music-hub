import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/**
 * Invite a non-registered artist via email for a feature on a song
 * Creates a pending invitation and returns a registration link
 */
export const inviteArtistForFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      song_id: string;
      email: string;
      artist_name?: string;
      role?: "featured" | "producer" | "writer" | "remixer";
      split_pct?: number;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Validate split percentage
    if (data.split_pct !== undefined) {
      if (!Number.isFinite(data.split_pct) || data.split_pct < 0 || data.split_pct > 100) {
        throw new Error("split_pct must be between 0 and 100");
      }
    }

    // Check if user is an approved artist
    const { data: artist } = await supabase
      .from("artists")
      .select("id, name")
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (!artist) throw new Error("You must be an approved artist to send feature invitations");

    // Check if song belongs to this artist
    const { data: song } = await supabase
      .from("songs")
      .select("id, title, artist_id")
      .eq("id", data.song_id)
      .eq("artist_id", (artist as any).id)
      .maybeSingle();
    if (!song) throw new Error("Song not found or you don't have permission");

    // Check if email already exists as a user
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingUser } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();
    
    if (existingUser) {
      // User already exists, check if they have an artist profile
      const { data: existingArtist } = await supabaseAdmin
        .from("artists")
        .select("id, name, status")
        .eq("user_id", existingUser.id)
        .maybeSingle();
      
      if (existingArtist && existingArtist.status === "approved") {
        // Artist exists and is approved, use existing collaborator system
        const { inviteCollaborator } = await import("./collabs.functions");
        await inviteCollaborator({
          data: {
            song_id: data.song_id,
            artist_id: existingArtist.id,
            role: data.role || "featured",
            split_pct: data.split_pct || 0,
          },
        });
        return { 
          ok: true, 
          existingUser: true,
          message: "Artist already registered. Collaborator invite sent directly." 
        };
      }
      
      // User exists but no artist profile or not approved
      throw new Error("User exists but doesn't have an approved artist profile. Please ask them to apply as an artist first.");
    }

    // Create invitation in invitations table
    const { data: invitation, error } = await supabaseAdmin
      .from("invitations")
      .insert({
        kind: "feature_request",
        from_user_id: userId,
        to_email: data.email.toLowerCase(),
        payload: {
          song_id: data.song_id,
          song_title: (song as any).title,
          artist_name: data.artist_name,
          role: data.role || "featured",
          split_pct: data.split_pct || 0,
          invited_by_artist_id: (artist as any).id,
          invited_by_artist_name: (artist as any).name,
        },
        status: "pending",
      } as any)
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    // Generate registration link with invitation context
    const registrationLink = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/register?invite=${(invitation as any).id}&type=feature`;

    await audit(userId, "feature_invite.create", "invitation", (invitation as any).id, {
      to_email: data.email,
      song_id: data.song_id,
    });

    return { 
      ok: true, 
      existingUser: false,
      invitation_id: (invitation as any).id,
      registration_link: registrationLink,
      message: "Invitation created. Share this registration link with the artist." 
    };
  });

/**
 * Invite a non-registered label via email for a label release
 * Creates a pending invitation and returns a registration link
 */
export const inviteLabelForRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      song_id?: string;
      album_id?: string;
      email: string;
      label_name?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Check if user is an approved artist
    const { data: artist } = await supabase
      .from("artists")
      .select("id, name")
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (!artist) throw new Error("You must be an approved artist to send label invitations");

    // Validate that either song_id or album_id is provided
    if (!data.song_id && !data.album_id) {
      throw new Error("Either song_id or album_id must be provided");
    }

    // Verify ownership of the song/album
    if (data.song_id) {
      const { data: song } = await supabase
        .from("songs")
        .select("id, title, artist_id")
        .eq("id", data.song_id)
        .eq("artist_id", (artist as any).id)
        .maybeSingle();
      if (!song) throw new Error("Song not found or you don't have permission");
    }

    if (data.album_id) {
      const { data: album } = await supabase
        .from("albums")
        .select("id, title, artist_id")
        .eq("id", data.album_id)
        .eq("artist_id", (artist as any).id)
        .maybeSingle();
      if (!album) throw new Error("Album not found or you don't have permission");
    }

    // Check if email already exists as a user
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingUser } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();
    
    if (existingUser) {
      // User already exists, check if they have a label
      const { data: existingLabel } = await supabaseAdmin
        .from("labels")
        .select("id, name, status, owner_user_id")
        .eq("owner_user_id", existingUser.id)
        .maybeSingle();
      
      if (existingLabel && existingLabel.status === "approved") {
        // Label exists and is approved, user should use existing label invitation system
        throw new Error("Label already registered. Please use the label dashboard to invite artists.");
      }
      
      // User exists but no label or not approved
      throw new Error("User exists but doesn't have an approved label. Please ask them to apply as a label first.");
    }

    // Create invitation in invitations table
    const { data: invitation, error } = await supabaseAdmin
      .from("invitations")
      .insert({
        kind: "label_apply",
        from_user_id: userId,
        to_email: data.email.toLowerCase(),
        payload: {
          song_id: data.song_id,
          album_id: data.album_id,
          label_name: data.label_name,
          invited_by_artist_id: (artist as any).id,
          invited_by_artist_name: (artist as any).name,
        },
        status: "pending",
      } as any)
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    // Generate registration link with invitation context
    const registrationLink = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/register?invite=${(invitation as any).id}&type=label`;

    await audit(userId, "label_invite.create", "invitation", (invitation as any).id, {
      to_email: data.email,
      song_id: data.song_id,
      album_id: data.album_id,
    });

    return { 
      ok: true, 
      existingUser: false,
      invitation_id: (invitation as any).id,
      registration_link: registrationLink,
      message: "Invitation created. Share this registration link with the label." 
    };
  });

/**
 * Get invitation details by ID (for registration flow)
 */
export const getInvitationDetails = createServerFn({ method: "GET" })
  .validator((d: { invitation_id: string }) => d)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!, 
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: invitation } = await sb
      .from("invitations")
      .select("*")
      .eq("id", data.invitation_id)
      .eq("status", "pending")
      .maybeSingle();

    if (!invitation) {
      return { exists: false };
    }

    return { 
      exists: true, 
      kind: (invitation as any).kind,
      payload: (invitation as any).payload,
      from_user_id: (invitation as any).from_user_id,
    };
  });

/**
 * Accept invitation after registration
 */
export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { invitation_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invitation } = await supabaseAdmin
      .from("invitations")
      .select("*")
      .eq("id", data.invitation_id)
      .eq("to_email", (context as any).email)
      .eq("status", "pending")
      .maybeSingle();

    if (!invitation) {
      throw new Error("Invitation not found or already processed");
    }

    const kind = (invitation as any).kind;
    const payload = (invitation as any).payload;

    if (kind === "feature_request") {
      // After user becomes an approved artist, create the collaborator entry
      const { data: artist } = await supabaseAdmin
        .from("artists")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "approved")
        .maybeSingle();

      if (!artist) {
        throw new Error("You must have an approved artist profile to accept feature invitations");
      }

      const { error } = await supabaseAdmin
        .from("song_collaborators")
        .insert({
          song_id: payload.song_id,
          artist_id: (artist as any).id,
          role: payload.role || "featured",
          split_pct: payload.split_pct || 0,
          invited_by: (invitation as any).from_user_id,
          accepted: true,
        } as any);

      if (error) throw new Error(error.message);
    } else if (kind === "label_apply") {
      // After user becomes an approved label, the label can then invite the artist
      const { data: label } = await supabaseAdmin
        .from("labels")
        .select("id")
        .eq("owner_user_id", userId)
        .eq("status", "approved")
        .maybeSingle();

      if (!label) {
        throw new Error("You must have an approved label to accept label invitations");
      }

      // The artist can now be invited to the label using the existing system
      // This is a placeholder - the actual flow would need the artist to accept the label invite
    }

    // Update invitation status
    await supabaseAdmin
      .from("invitations")
      .update({ 
        status: "accepted",
        responded_at: new Date().toISOString(),
        to_user_id: userId,
      } as any)
      .eq("id", data.invitation_id);

    await audit(userId, "invitation.accept", "invitation", data.invitation_id, {
      kind,
    });

    return { ok: true };
  });
