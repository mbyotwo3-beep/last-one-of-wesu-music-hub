import type { Json } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";

/**
 * Live USD→ZMW rate for DISPLAY ONLY. Every charge settles in Kwacha
 * through Lenco — a USD-mode listener just sees the Kwacha price converted
 * at the current market rate.
 *
 * Source: open.er-api.com (free, no key, market mid-rates — the same feed
 * banks derive retail rates from). The last good rate is cached in
 * platform_settings ("fx" row) for FX_STALE_MS so cold starts and feed
 * outages still show a recent rate instead of hammering the feed.
 */

export const FX_FALLBACK_ZMW_PER_USD = 27;
export const FX_STALE_MS = 6 * 60 * 60 * 1000;
const FX_FEED_URL = "https://open.er-api.com/v6/latest/USD";

export interface FxRate {
  /** Kwacha per 1 USD. */
  zmwPerUsd: number;
  /** True when this value came from a fresh feed fetch. */
  live: boolean;
  /** ISO timestamp the rate was minted. */
  updatedAt: string;
}

/** Extract a sane ZMW-per-USD rate from an exchange-rate payload. Null when
 *  the payload is missing/garbage — callers fall back to the cached rate. */
export function parseZmwPerUsd(payload: unknown): number | null {
  try {
    const rates = (payload as { rates?: Record<string, unknown> } | null)?.rates;
    const raw = rates?.["ZMW"];
    const rate = typeof raw === "string" ? Number(raw) : (raw as number | undefined);
    if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
    // Sanity band: rejects 0/negatives and absurd spikes while tolerating
    // any realistic future move of the Kwacha.
    if (rate <= 1 || rate > 1000) return null;
    return rate;
  } catch {
    return null;
  }
}

async function fetchLiveRate(): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(FX_FEED_URL, { signal: ctrl.signal });
    if (!res.ok) return null;
    return parseZmwPerUsd(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const getFxRate = createServerFn({ method: "GET" }).handler(async (): Promise<FxRate> => {
  const now = Date.now();
  const fallback: FxRate = {
    zmwPerUsd: FX_FALLBACK_ZMW_PER_USD,
    live: false,
    updatedAt: new Date(0).toISOString(),
  };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", "fx")
      .maybeSingle();
    const cached = (data?.value ?? null) as {
      rate?: unknown;
      updatedAt?: unknown;
    } | null;
    const cachedRate =
      typeof cached?.rate === "number" && Number.isFinite(cached.rate) ? cached.rate : null;
    const cachedAt = typeof cached?.updatedAt === "string" ? Date.parse(cached.updatedAt) : NaN;
    if (cachedRate && Number.isFinite(cachedAt) && now - cachedAt < FX_STALE_MS) {
      return {
        zmwPerUsd: cachedRate,
        live: false,
        updatedAt: new Date(cachedAt).toISOString(),
      };
    }
    const live = await fetchLiveRate();
    if (live) {
      const fx = { rate: live, updatedAt: new Date(now).toISOString(), source: "open.er-api.com" };
      try {
        await supabaseAdmin
          .from("platform_settings")
          .upsert({ key: "fx", value: fx as unknown as Json }, { onConflict: "key" });
      } catch {
        /* cache write is best-effort — the fresh rate is still returned */
      }
      return { zmwPerUsd: live, live: true, updatedAt: fx.updatedAt };
    }
    if (cachedRate) {
      return {
        zmwPerUsd: cachedRate,
        live: false,
        updatedAt: Number.isFinite(cachedAt)
          ? new Date(cachedAt).toISOString()
          : fallback.updatedAt,
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
});
