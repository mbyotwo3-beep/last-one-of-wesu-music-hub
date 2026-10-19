import { useEffect, useState } from "react";

import {
  checkoutCachedArtworkGradient,
  extractDominantColor,
  gradientFromColor,
  gradientFromHue,
  hashHue,
  storeArtworkGradient,
} from "@/lib/artwork-color";
import { peekImageUrl, resolveImageUrl, type ImageBucket } from "@/lib/storage-url";

/**
 * The gradient behind a cover: the real one when the artwork can be sampled,
 * a stable hashed tint until then and after any canvas failure.
 *
 * WHY THE FIRST PAINT IS THE HASH AND NOT BLANK
 *
 * Sampling resolves after mount (Image decode + canvas read). A blank wait
 * would paint every shelf in neutral grey and then jump to colour a moment
 * later — the flash this work exists to remove. The hash is instant, sided
 * with the server, and only ever REFINED, never reversed to grey.
 */
export function useArtworkGradient(bucket: ImageBucket, path?: string | null): { css: string } {
  const fallbackKey = `${bucket}:${path ?? ""}`;
  const [css, setCss] = useState<string>(() => gradientFromHue(hashHue(fallbackKey)));

  useEffect(() => {
    if (!path) return;
    let cancelled = false;

    (async () => {
      const url = peekImageUrl(bucket, path) ?? (await resolveImageUrl(bucket, path));
      if (cancelled || !url) return;

      // A previous mount may already have sampled this artwork.
      const cached = checkoutCachedArtworkGradient(url);
      if (cached) {
        setCss(cached);
        return;
      }

      const dominant = await extractDominantColor(url);
      if (!dominant || cancelled) return;
      setCss(storeArtworkGradient(url, gradientFromColor(dominant)));
    })();

    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  return { css };
}

export { gradientFromHue, hashHue };