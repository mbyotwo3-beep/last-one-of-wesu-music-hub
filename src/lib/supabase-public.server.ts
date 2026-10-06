import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side publishable Supabase client.
 * Use ONLY inside server function / server route handlers.
 * RLS applies as the `anon` role — only data with public SELECT policies is visible.
 */
export function getPublicSupabase() {
  const envObj = ((globalThis as any).__env__ ?? {}) as Record<string, string | undefined>;
  const url = process.env.SUPABASE_URL || envObj.SUPABASE_URL || "";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || envObj.SUPABASE_PUBLISHABLE_KEY || "";
  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
