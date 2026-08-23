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
          { key: "pricing", value: DEFAULT_PRICING },
          { onConflict: "key" }
        );
      
      // Initialize verification
      await supabaseAdmin
        .from("platform_settings")
        .upsert(
          { key: "verification", value: DEFAULT_VERIFICATION },
          { onConflict: "key" }
        );
      
      // Initialize withdrawal
      await supabaseAdmin
        .from("platform_settings")
        .upsert(
          { key: "withdrawal", value: DEFAULT_WITHDRAWAL },
          { onConflict: "key" }
        );
      
      // Initialize site settings with defaults
      await supabaseAdmin
        .from("platform_settings")
        .upsert(
          { 
            key: "site", 
            value: { 
              name: "Wesu+", 
              support_email: "support@wesuplusly.com",
              commission_pct: 20 
            } 
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
