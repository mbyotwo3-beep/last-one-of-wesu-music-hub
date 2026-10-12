import { useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPreviewAudioUrl } from "@/lib/listener.functions";
import { supabase } from "@/integrations/supabase/client";
import { setCachedAudioUrl, getCachedAudioUrl } from "@/lib/audio";
import { warmPreview } from "@/lib/preview-preload";

/**
 * Warm a song's preview URL the moment the listener shows intent to play it.
 *
 * WHY THIS EXISTS — the transition gap
 *
 * Every play resolves a signed URL first. PlayerBar does this:
 *
 *     audio.pause(); audio.removeAttribute("src"); audio.load();   ← silence
 *     await isTrackDownloaded(...)
 *     await getPreviewFn(...)                                     ← round trip
 *     audio.src = url; audio.play()
 *
 * The element is cleared BEFORE the round trip, so there is silence for the
 * whole of it. On a good connection that is a few hundred milliseconds and
 * reads as a hitch; on mobile data in Lusaka it is seconds, and the complaint is
 * exactly what was reported: moving from one song to another is not smooth.
 *
 * WHY THE EXISTING WARM DID NOT COVER IT
 *
 * PlayerBar pre-signs queue[next] — the next track in order, only while
 * playing, only when the queue has 2+ entries. That helps auto-advance and
 * Next. It does nothing for the far more common case: the listener taps a
 * DIFFERENT song from a grid or a list. Nothing is warm for that song, so the
 * tap always pays the full round trip into silence.
 *
 * And usePreviewWarm, which warms a whole visible list, was only ever wired into
 * /albums/$id. Home, Browse, Search, Library, Playlists and Liked Songs had none.
 *
 * WHY INTENT, NOT THE WHOLE LIST
 *
 * Warming every visible row costs a request per row — on metered data that is
 * the expensive thing this feature was built to avoid. Warming on intent costs
 * one request for the song actually being reached for, and zero for the ones
 * that are scrolled past.
 *
 * pointerdown is used rather than pointerenter because on a touch screen there is
 * no hover: pointerenter is unreliable there and pointerdown fires for both mouse
 * and touch, giving the request a head start before the click resolves.
 */
export function useIntentWarm() {
  const getPreviewFn = useServerFn(getPreviewAudioUrl);

  // One in-flight warm per song. A listener mousing across a grid would otherwise
  // fire the same request repeatedly.
  const inFlight = useRef(new Set<string>());

  const warm = useCallback(
    async (songId: string, price?: number | null) => {
      if (!songId) return;
      // Free songs play in full from a public URL; a preview entry would cap them
      // at 15 seconds and mislabel them in the UI.
      if (Number(price ?? 0) <= 0) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (inFlight.current.has(songId)) return;

      inFlight.current.add(songId);
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id ?? null;
        // Already resolved — nothing to do.
        if (getCachedAudioUrl(songId, uid)) return;
        const res = await getPreviewFn({
          data: { song_id: songId, access_token: data.session?.access_token ?? null },
        });
        if (res?.url) setCachedAudioUrl(songId, uid, res.url, true);
      } catch {
        // A failed warm must never surface. The tap still resolves normally; it
        // just resolves the slow way.
      } finally {
        inFlight.current.delete(songId);
      }
    },
    [getPreviewFn],
  );

  /** Spread onto a tappable song element. */
  const intentProps = useCallback(
    (songId: string, price?: number | null) => ({
      onPointerDown: () => void warm(songId, price),
      onFocus: () => void warm(songId, price),
    }),
    [warm],
  );

  return { warm, intentProps };
}

/**
 * Warm a list on intent for surfaces that render many rows.
 *
 * Exported separately so a component can hand `intentProps` to its own row
 * renderer without every row needing its own hook.
 */
export function warmOnIntent(
  warm: (id: string, price?: number | null) => void,
  song: { id: string; price?: number | null },
) {
  return {
    onPointerDown: () => void warm(song.id, song.price),
    onFocus: () => void warm(song.id, song.price),
  };
}

// Keep the import of warmPreview meaningful for callers that want the shared
// queue rather than a direct call.
export { warmPreview };
