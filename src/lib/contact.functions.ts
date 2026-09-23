import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "@/lib/roles";

/**
 * Contact/support inbox owned entirely by superadmin + admin users — there
 * is no external support mailbox. Visitors submit from /contact; staff read
 * and resolve from the admin panel.
 */

export interface SupportMessageInput {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

/** Pure validation shared by client pre-checks and unit tests. */
export function validateSupportMessage(input: {
  name?: string;
  email?: string;
  subject?: string | null;
  message?: string;
}): string | null {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  const message = (input.message ?? "").trim();
  const subject = (input.subject ?? "").trim();
  if (!name) return "Please tell us your name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  if (!message) return "Please write your message";
  if (message.length > 5000) return "Message is too long (max 5000 characters)";
  if (subject.length > 120) return "Subject is too long (max 120 characters)";
  return null;
}

export const submitSupportMessage = createServerFn({ method: "POST" })
  .validator((d: SupportMessageInput) => d)
  .handler(async ({ data }) => {
    const problem = validateSupportMessage(data);
    if (problem) throw new Error(problem);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // No auth middleware here (anonymous visitors must reach us). The email
    // identifies the sender; staff reply by email.
    const { error } = await supabaseAdmin.from("support_messages").insert({
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      user_id: null,
      subject: (data.subject ?? "").trim() || null,
      message: data.message.trim(),
      status: "open",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSupportMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isStaffUser(context.supabase, context.userId))) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("support_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const resolveSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    if (!(await isStaffUser(context.supabase, context.userId))) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("support_messages")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: context.userId,
      } as any)
      .eq("id", data.id)
      .eq("status", "open");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
