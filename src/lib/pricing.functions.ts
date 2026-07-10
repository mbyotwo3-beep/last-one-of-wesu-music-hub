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
