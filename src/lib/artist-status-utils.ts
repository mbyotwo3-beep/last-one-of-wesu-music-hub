/**
 * Artist Status Utilities
 * 
 * Helper functions to diagnose and fix artist visibility issues.
 * These are utility functions for debugging and should be called via server functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ArtistStatusReport {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  pendingArtists: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
    user_id: string;
  }>;
}

/**
 * Get a comprehensive report of all artists and their statuses
 */
export async function getArtistStatusReport(
  supabase: SupabaseClient
): Promise<ArtistStatusReport> {
  // Get counts by status
  const [approvedRes, pendingRes, rejectedRes, pendingListRes] = await Promise.all([
    supabase.from("artists").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("artists").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("artists").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    supabase
      .from("artists")
      .select("id, name, status, created_at, user_id")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const approved = approvedRes.count ?? 0;
  const pending = pendingRes.count ?? 0;
  const rejected = rejectedRes.count ?? 0;

  return {
    total: approved + pending + rejected,
    approved,
    pending,
    rejected,
    pendingArtists: pendingListRes.data ?? [],
  };
}

/**
 * Check if an artist has the 'artist' role in user_roles table
 */
export async function checkArtistRole(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "artist")
    .maybeSingle();

  return !!data;
}

/**
 * Get all approved artists that don't have the artist role
 * (useful for finding and fixing data inconsistencies)
 */
export async function getApprovedArtistsWithoutRole(supabase: SupabaseClient) {
  const { data: artists } = await supabase
    .from("artists")
    .select("id, name, user_id, status")
    .eq("status", "approved");

  if (!artists) return [];

  const missingRole: Array<{ id: string; name: string; user_id: string }> = [];

  for (const artist of artists) {
    const hasRole = await checkArtistRole(supabase, artist.user_id);
    if (!hasRole) {
      missingRole.push({
        id: artist.id,
        name: artist.name,
        user_id: artist.user_id,
      });
    }
  }

  return missingRole;
}

/**
 * Get diagnostic information for debugging
 */
export async function getDiagnosticInfo(supabase: SupabaseClient) {
  const report = await getArtistStatusReport(supabase);
  const missingRoles = await getApprovedArtistsWithoutRole(supabase);

  return {
    statusReport: report,
    dataIntegrity: {
      approvedArtistsWithoutRole: missingRoles,
    },
    summary: {
      totalArtists: report.total,
      visibleOnArtistsPage: report.approved,
      awaitingApproval: report.pending,
      rejected: report.rejected,
      needsRoleFix: missingRoles.length,
    },
  };
}

/**
 * Format diagnostic report as human-readable text
 */
export function formatDiagnosticReport(info: Awaited<ReturnType<typeof getDiagnosticInfo>>): string {
  const lines = [
    "=== ARTIST STATUS DIAGNOSTIC REPORT ===",
    "",
    "Summary:",
    `  Total Artists: ${info.summary.totalArtists}`,
    `  Visible on /artists page: ${info.summary.visibleOnArtistsPage}`,
    `  Awaiting Approval: ${info.summary.awaitingApproval}`,
    `  Rejected: ${info.summary.rejected}`,
    "",
  ];

  if (info.summary.awaitingApproval > 0) {
    lines.push("⚠️  Pending Artists (need admin approval):");
    info.statusReport.pendingArtists.forEach((a) => {
      lines.push(`  - ${a.name} (ID: ${a.id})`);
    });
    lines.push("");
  }

  if (info.summary.needsRoleFix > 0) {
    lines.push("⚠️  Data Integrity Issues:");
    lines.push(`  ${info.summary.needsRoleFix} approved artists missing 'artist' role`);
    info.dataIntegrity.approvedArtistsWithoutRole.forEach((a) => {
      lines.push(`  - ${a.name} (ID: ${a.id})`);
    });
    lines.push("");
  }

  if (info.summary.awaitingApproval === 0 && info.summary.needsRoleFix === 0) {
    lines.push("✅ All systems nominal!");
  } else {
    lines.push("Recommendation:");
    if (info.summary.awaitingApproval > 0) {
      lines.push("  1. Go to /admin and click the 'artists' tab");
      lines.push("  2. Click 'Approve' for each pending artist");
    }
    if (info.summary.needsRoleFix > 0) {
      lines.push("  3. Contact system administrator to fix missing roles");
    }
  }

  return lines.join("\n");
}
