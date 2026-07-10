import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side publishable Supabase client.
 * Use ONLY inside server function / server route handlers.
 * RLS applies as the `anon` role — only data with public SELECT policies is visible.
 */
export function getPublicSupabase() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
