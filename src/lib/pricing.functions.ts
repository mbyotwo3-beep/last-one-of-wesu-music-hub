import type { Json } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";

export interface PricingConfig {
  song_min: number;
  song_max: number;
  album_min: number;
  album_max: number;
  free_song_fee: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  song_min: 10,
  song_max: 100,
  album_min: 150,
  album_max: 250,
  free_song_fee: 100,
};

export interface VerificationConfig {
  min_followers: number;
  min_earnings: number;
}

export const DEFAULT_VERIFICATION: VerificationConfig = {
  min_followers: 100,
  min_earnings: 500,
};

export interface WithdrawalConfig {
  min_amount: number;
}

export const DEFAULT_WITHDRAWAL: WithdrawalConfig = {
  min_amount: 500,
};

export interface SiteConfig {
  name: string;
  support_email: string;
  commission_pct: number;
  url: string;
  description: string;
  twitter_handle: string;
}

export const DEFAULT_SITE: SiteConfig = {
  name: "Wesu+",
  support_email: "support@wesuplusly.com",
  commission_pct: 20,
  url: "https://www.wesuplusly.com",
  description: "Stream Zambian and African music. Free & Premium tiers with Mobile Money payments.",
  twitter_handle: "@wesuplus",
};

/**
 * Initialize platform_settings with default values if they don't exist.
 * This ensures the dynamic config system works from the start.
 */
export const initializePlatformSettings = createServerFn({ method: "POST" }).handler(
  async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      
      // Initialize pricing
      await supabaseAdmin
        .from("platform_settings")
        .upsert(
          { key: "pricing", value: DEFAULT_PRICING as unknown as Json },
          { onConflict: "key" }
        );
      
      // Initialize verification
      await supabaseAdmin
        .from("platform_settings")
        .upsert(
          { key: "verification", value: DEFAULT_VERIFICATION as unknown as Json },
          { onConflict: "key" }
        );
      
      // Initialize withdrawal
      await supabaseAdmin
        .from("platform_settings")
        .upsert(
          { key: "withdrawal", value: DEFAULT_WITHDRAWAL as unknown as Json },
          { onConflict: "key" }
        );
      
      // Initialize site settings with defaults
      await supabaseAdmin
        .from("platform_settings")
        .upsert(
          { 
            key: "site", 
            value: DEFAULT_SITE as unknown as Json 
          },
          { onConflict: "key" }
        );
      
      return { success: true };
    } catch (error) {
      console.error("Failed to initialize platform settings:", error);
      return { success: false, error: (error as Error).message };
    }
  },
);

/**
 * Public read of the current pricing config. Read via service role
 * because platform_settings is staff-only; only the single "pricing"
 * row is exposed, and only numeric fields with defaults.
 */
export const getPricingConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PricingConfig> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "pricing")
        .maybeSingle();
      const v = (data?.value as Partial<PricingConfig> | null) ?? {};
      return {
        song_min: Number(v.song_min ?? DEFAULT_PRICING.song_min),
        song_max: Number(v.song_max ?? DEFAULT_PRICING.song_max),
        album_min: Number(v.album_min ?? DEFAULT_PRICING.album_min),
        album_max: Number(v.album_max ?? DEFAULT_PRICING.album_max),
        free_song_fee: Number(v.free_song_fee ?? DEFAULT_PRICING.free_song_fee),
      };
    } catch {
      return DEFAULT_PRICING;
    }
  },
);

/**
 * Public read of the current verification config.
 */
export const getVerificationConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<VerificationConfig> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "verification")
        .maybeSingle();
      const v = (data?.value as Partial<VerificationConfig> | null) ?? {};
      return {
        min_followers: Number(v.min_followers ?? DEFAULT_VERIFICATION.min_followers),
        min_earnings: Number(v.min_earnings ?? DEFAULT_VERIFICATION.min_earnings),
      };
    } catch {
      return DEFAULT_VERIFICATION;
    }
  },
);

/**
 * Public read of the current withdrawal config.
 */
export const getWithdrawalConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<WithdrawalConfig> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "withdrawal")
        .maybeSingle();
      const v = (data?.value as Partial<WithdrawalConfig> | null) ?? {};
      return {
        min_amount: Number(v.min_amount ?? DEFAULT_WITHDRAWAL.min_amount),
      };
    } catch {
      return DEFAULT_WITHDRAWAL;
    }
  },
);

/**
 * Public read of the current site config.
 */
export const getSiteConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteConfig> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "site")
        .maybeSingle();
      const v = (data?.value as Partial<SiteConfig> | null) ?? {};
      return {
        name: v.name ?? DEFAULT_SITE.name,
        support_email: v.support_email ?? DEFAULT_SITE.support_email,
        commission_pct: Number(v.commission_pct ?? DEFAULT_SITE.commission_pct),
        url: v.url ?? DEFAULT_SITE.url,
        description: v.description ?? DEFAULT_SITE.description,
        twitter_handle: v.twitter_handle ?? DEFAULT_SITE.twitter_handle,
      };
    } catch {
      return DEFAULT_SITE;
    }
  },
);

/**
 * Server-side helper to get site config (for use in other server functions)
 */
export async function getSiteConfigServer(): Promise<SiteConfig> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", "site")
      .maybeSingle();
    const v = (data?.value as Partial<SiteConfig> | null) ?? {};
    return {
      name: v.name ?? DEFAULT_SITE.name,
      support_email: v.support_email ?? DEFAULT_SITE.support_email,
      commission_pct: Number(v.commission_pct ?? DEFAULT_SITE.commission_pct),
      url: v.url ?? DEFAULT_SITE.url,
      description: v.description ?? DEFAULT_SITE.description,
      twitter_handle: v.twitter_handle ?? DEFAULT_SITE.twitter_handle,
    };
  } catch {
    return DEFAULT_SITE;
  }
}
