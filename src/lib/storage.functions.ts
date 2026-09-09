import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ───────────────────────────────────────────────────
export interface StorageFile {
  name: string;
  bucket_id: string;
  size: number;
  created_at: string;
  metadata: any;
}

async function assertSuperadmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("superadmin")) {
    throw new Error("Forbidden: superadmin only");
  }
}

// ─── Superadmin: list all files from a bucket ─────────────
export const listStorageFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { bucket: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: files, error } = await (supabaseAdmin as any)
      .storage
      .from(data.bucket)
      .list("", { limit: 1000 });

    if (error) throw new Error(error.message);

    return (files ?? []).map((f: any) => ({
      name: f.name,
      bucket_id: data.bucket,
      size: f.metadata?.size || 0,
      created_at: f.created_at,
      metadata: f.metadata,
    })) as StorageFile[];
  });

// ─── Superadmin: delete a file from storage ───────────────
export const deleteStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { bucket: string; path: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseAdmin as any)
      .storage
      .from(data.bucket)
      .remove([data.path]);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Superadmin: get all buckets ─────────────────────────────
export const listStorageBuckets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: buckets, error } = await (supabaseAdmin as any)
      .storage
      .listBuckets();

    if (error) throw new Error(error.message);

    return (buckets ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      public: b.public,
    }));
  });
