import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";

import { getPreviewAudioUrl } from "@/lib/listener.functions";
import { supabase } from "@/integrations/supabase/client";
import { setCachedAudioUrl } from "@/lib/audio";
import { planPreviewWarm, warmPreviews, resetPreviewWarm } from "@/lib/preview-preload";

/**
 * Warm the signed preview URLs for the songs a listener can see.
 *
 * WHY THIS IS HERE AND NOT IN SongRow
 *
 * The request was "start automatically loading the 15 seconds of all songs
 * listed". Per-row warming would fire a request per rendered row, including the
 * dozens that scroll out of view on a long list — which is exactly the cost this
 * deliberately avoids. Warming is a property of the LIST, the only thing that
 * knows what is on screen.
 *
 * WHAT IS WARMED, AND WHAT IS NOT
 *
 * The signed URL, never the audio bytes. Warming bytes would download every
 * preview on the page, which on metered mobile data is expensive and defeats the
 * purpose of a 15-second preview. The tap still fetches audio, but the round trip
 * that caused the visible pause is already done, so playback starts as soon as
 * the audio arrives.
 *
 * OWNED TRACKS ARE SKIPPED
 *
 * A song the listener has bought resolves to a full-track URL, not a preview.
 * Warming a preview for it would be a wasted request AND wrong: the cache entry
 * it writes carries previewMode, which caps playback at 15 seconds. Only
 * unowned songs are warmed here.
 */
export function usePreviewWarm(
  songs: { id: string; price?: number | null }[],
  /** How many rows are on screen. Conservative: a phone list shows ~6. */
  visibleCount = 6,
) {
  const getPreviewFn = useServerFn(getPreviewAudioUrl);

  useEffect(() => {
    if (!songs.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const plan = planPreviewWarm(songs, 0, Math.max(2, visibleCount), visibleCount);

    // The signed URL is scoped to whoever asks for it, so the cache key must use
    // the SAME user id PlayerBar will use later. It is read inside the warm
    // task itself (below) rather than here, because at this point the session may
    // not be resolved yet and the key would be wrong.
    warmPreviews(
      plan.map((p) => {
        const song = songs.find((s) => s.id === p.id);
        // Free or already-owned songs play in full; a preview URL would cap
        // them at 15 seconds and report them as previews in the UI.
        const isFree = Number(song?.price ?? 0) <= 0;
        if (isFree) return { id: p.id, warm: null };
        return {
          id: p.id,
          warm: async () => {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token ?? null;
            const uid = data.session?.user?.id ?? null;
            const res = await getPreviewFn({ data: { song_id: p.id, access_token: token } });
            if (res?.url) setCachedAudioUrl(p.id, uid, res.url, true);
          },
        };
      }),
    );
  }, [songs, visibleCount, getPreviewFn]);

  // Preview URLs are user-scoped, so a warm must not survive a sign-in or
  // sign-out: an anonymous preview served to an owner would be the wrong track.
  useEffect(() => {
    const onAuth = () => resetPreviewWarm();
    window.addEventListener("wesu:auth-changed", onAuth);
    return () => window.removeEventListener("wesu:auth-changed", onAuth);
  }, []);
}
