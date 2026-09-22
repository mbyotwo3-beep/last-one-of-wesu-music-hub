import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Heart,
  Loader2,
  Radio,
  X,
  Maximize2,
  Minimize2,
  Repeat,
  Repeat1,
  Shuffle,
  ListMusic,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import {
  getSignedAudioUrl,
  getPublicAudioUrl,
  getPreviewAudioUrl,
  getDownloadAudioUrl,
  incrementPlayCount,
} from "@/lib/listener.functions";
import { recordPlay, updatePlayProgress } from "@/lib/play-history.functions";
import { Link } from "@tanstack/react-router";
import { useIsNative } from "@/hooks/use-platform";
import { useTrackMeta } from "@/hooks/use-track-meta";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { ShareMenu } from "@/components/ShareMenu";

import {
  preloadNative,
  playNative,
  pauseNative,
  resumeNative,
  stopNative,
  onNativeComplete,
  onNativeTimeUpdate,
  isNativeAudioAvailable,
  configureNativeAudio,
  prepareNativeOfflineTrack,
  deleteNativeTempFile,
  cleanupStaleNativeTempFiles,
  seekNative,
  setNativeVolume,
  getNativeDuration,
  getNativeCurrentTime,
  isNativePlaying,
  setNativeSeekHook,
  shouldSyncPlaying,
  getLastNativeCommandAt,
  markNativeCommand,
  seekNative,
  buildNotificationMetadata,
} from "@/lib/native-audio";
import { resolveImageUrl } from "@/lib/storage-url";
import {
  isTrackDownloaded,
  getOfflineObjectUrl,
  isVaultLicenseStale,
  VAULT_LICENSE_MAX_AGE_MS,
  decideStaleVaultPlayback,
} from "@/lib/offline-vault";
import { supabase } from "@/integrations/supabase/client";
import { getAudio, primeAudio, getCachedAudioUrl, setCachedAudioUrl } from "@/lib/audio";

let _nativeAvailable: boolean | null = null;

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar({ audioOnly = false }: { audioOnly?: boolean } = {}) {
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const progressSeconds = usePlayer((s) => s.progressSeconds);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const setAudioUrl = usePlayer((s) => s.setAudioUrl);
  const setProgress = usePlayer((s) => s.setProgress);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const skipNext = usePlayer((s) => s.skipNext);
  const skipPrev = usePlayer((s) => s.skipPrev);

  const { user } = useAuth();
  const isNative = useIsNative();
  const getSignedFn = useServerFn(getSignedAudioUrl);
  const getPublicFn = useServerFn(getPublicAudioUrl);
  const getPreviewFn = useServerFn(getPreviewAudioUrl);
  const probeDownloadFn = useServerFn(getDownloadAudioUrl);
  const incrementFn = useServerFn(incrementPlayCount);
  const recordPlayFn = useServerFn(recordPlay);
  const updatePlayProgressFn = useServerFn(updatePlayProgress);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const isPreview = usePlayer((s) => s.isPreview);
  const setIsPreview = usePlayer((s) => s.setIsPreview);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const selectionId = usePlayer((s) => s.selectionId);
  // Manual retry counter: pressing play on a failed track re-runs resolution
  // instead of sitting on a dead source.
  const [retryNonce, setRetryNonce] = useState(0);
  const appliedRetryRef = useRef(0);
  // The selection the engine has loaded (or is loading). Keyed off the
  // store's selectionId — NOT the track id — so re-selecting the same song
  // (queue duplicates, retry after failure) always reloads.
  const currentSelectionRef = useRef<number | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  // App-private staged file for native offline playback (deleted on change).
  const nativeTempPathRef = useRef<string | null>(null);
  const trackedHistoryTrackRef = useRef<string | null>(null);
  const resolvedForUserRef = useRef<string | null>(null);
  const nativeCleanupRef = useRef<(() => void) | null>(null);
  const audioEventsCleanupRef = useRef<(() => void) | null>(null);
  const trackSessionDetachRef = useRef<(() => void) | null>(null);
  // In-flight native stop from the track-change branch, awaited at the top
  // of loadUrl so a reselect can't unload the asset being preloaded.
  const pendingStopRef = useRef<Promise<void> | null>(null);
  // Selections that already burned their one auto-retry after a native
  // start failure (e.g. notification-STOP unloaded the asset).
  const nativeRetryRef = useRef<number | null>(null);

  /**
   * The UI believes audio is playing but the native engine refused to
   * start (returns false instead of throwing). Re-resolve once per
   * selection for a fresh preload; if that also fails, park as paused
   * with a retry message instead of showing playing-while-silent.
   */
  function noteNativeStartFailure() {
    const sel = currentSelectionRef.current;
    if (nativeRetryRef.current === sel) {
      nativeRetryRef.current = null;
      usePlayer.setState({ playing: false });
      setError("Playback was interrupted. Tap play to try again.");
    } else {
      nativeRetryRef.current = sel;
      setRetryNonce((n) => n + 1);
    }
  }
  // Latest known media duration for the lock-screen position state
  // (HTML element on web, native getDuration on device).
  const durationRef = useRef<number>(0);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { data: meta } = useTrackMeta(track?.id);
  const artistId: string | undefined = meta?.artists?.id ?? meta?.artist_id;
  const albumId: string | undefined = meta?.albums?.id ?? meta?.album_id;
  const trackPrice: number = Number(meta?.price ?? 0);
  const { isSaved: liked, toggle: toggleLike } = useSavedTrack(track?.id);

  // One-time native hygiene: drop staged temp files orphaned by an app
  // kill. The engine re-stages on demand, so this is always safe.
  useEffect(() => {
    if (!isNative) return;
    cleanupStaleNativeTempFiles().catch(() => {});
  }, [isNative]);

  // Load audio when the selection changes (or auth identity changes, or
  // the user manually retries a failed load).
  useEffect(() => {
    if (!track) {
      const previousId = currentTrackIdRef.current;
      const previousProgress = usePlayer.getState().progressSeconds;
      if (user && previousId && !isPreview && previousProgress > 0) {
        updatePlayProgressFn({
          data: { song_id: previousId, progress_seconds: previousProgress },
        }).catch(() => {});
      }
      if (currentTrackIdRef.current) stopNative(currentTrackIdRef.current).catch(() => {});
      nativeCleanupRef.current?.();
      nativeCleanupRef.current = null;
      audioEventsCleanupRef.current?.();
      audioEventsCleanupRef.current = null;
      deleteNativeTempFile(nativeTempPathRef.current).catch(() => {});
      nativeTempPathRef.current = null;
      getAudio().pause();
      // Clear stale lock-screen / notification controls on exit.
      try {
        if (typeof window !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.metadata = null;
        }
      } catch {
        /* ignore — unsupported browsers */
      }
      currentTrackIdRef.current = null;
      currentSelectionRef.current = null;
      setLoading(false);
      setIsPreview(false);
      setAudioDuration(0);
      trackedHistoryTrackRef.current = null;
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      return;
    }
    const isSameSelection =
      currentSelectionRef.current === selectionId && appliedRetryRef.current === retryNonce;
    if (isSameSelection) {
      // Same selection, but auth identity changed (login/logout/purchase)
      // while in preview mode → re-resolve entitlement instead of staying
      // stuck. Otherwise there is nothing new to load.
      if (resolvedForUserRef.current !== (user?.id ?? null) && usePlayer.getState().isPreview) {
        // fall through to re-resolve
      } else {
        return;
      }
    }

    if (currentTrackIdRef.current) {
      const previousId = currentTrackIdRef.current;
      const previousProgress = usePlayer.getState().progressSeconds;
      if (user && !isPreview && previousProgress > 0) {
        updatePlayProgressFn({
          data: { song_id: previousId, progress_seconds: previousProgress },
        }).catch(() => {});
      }
      // Stop the old asset first: same-id reselect (queue duplicate /
      // retry) would otherwise unload the asset the new load below is
      // about to preload. Awaited at the top of loadUrl (this body is sync).
      pendingStopRef.current = stopNative(previousId).catch(() => {});
      nativeCleanupRef.current?.();
      nativeCleanupRef.current = null;
      audioEventsCleanupRef.current?.();
      audioEventsCleanupRef.current = null;
      // Drop the previous track's staged offline file (app-private cache).
      deleteNativeTempFile(nativeTempPathRef.current).catch(() => {});
      nativeTempPathRef.current = null;
    }

    currentSelectionRef.current = selectionId;
    appliedRetryRef.current = retryNonce;
    currentTrackIdRef.current = track.id;
    resolvedForUserRef.current = user?.id ?? null;
    trackedHistoryTrackRef.current = null;
    setError(null);
    setLoading(true);
    // Stamp the command clock: the reconciler must not mistake slow
    // buffering for a lock-screen pause while this selection loads.
    markNativeCommand();
    // Mobile controls use the shared track URL to distinguish in-flight
    // resolution from a ready or failed audio source.
    setAudioUrl(undefined);
    setIsPreview(false);
    setAudioDuration(0);
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    const audio = getAudio();
    // Kill the previous song IMMEDIATELY: pause() alone leaves the old src
    // attached, and the play-state sync effect would resume the OLD song
    // while the new URL resolves ("plays previous song first" bug). It also
    // drops any primed silent placeholder so a failed load can never leave
    // the element "playing" silence.
    audio.pause();
    try {
      audio.removeAttribute("src");
      audio.load();
    } catch {
      /* ignore — element already empty */
    }

    let retries = 0;
    const isCurrentTrack = () =>
      currentSelectionRef.current === selectionId && appliedRetryRef.current === retryNonce;
    async function loadUrl() {
      try {
        // Let the previous asset's stop/unload land before preloading —
        // otherwise a same-id reselect kills the new playback.
        await pendingStopRef.current;
        pendingStopRef.current = null;
        let url: string;
        let previewMode = false;
        // Encrypted on-device copy wins over streaming (instant, works
        // offline). Vault tracks only ever land there after a server-side
        // entitlement check, so this is always full-length audio.
        let offline = false;
        try {
          if (await isTrackDownloaded(track!.id)) {
            const obj = await getOfflineObjectUrl(track!.id);
            if (obj && isCurrentTrack()) {
              // Spotify-style license check: copies older than 30 days
              // revalidate purchase when online. Offline (or a probe that
              // fails for non-purchase reasons) always plays — offline
              // must work offline.
              const stale = await isVaultLicenseStale(track!.id, VAULT_LICENSE_MAX_AGE_MS);
              const online =
                typeof navigator === "undefined" || navigator.onLine !== false;
              let purchaseFailed = false;
              if (stale && online && user) {
                try {
                  await probeDownloadFn({ data: { song_id: track!.id } });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "";
                  purchaseFailed = /purchase|buy|entitl|unlock|payment|402|403/i.test(msg);
                }
                if (!isCurrentTrack()) return;
              }
              if (
                decideStaleVaultPlayback({ stale, online, probePurchaseFailed: purchaseFailed }) ===
                "blocked"
              ) {
                setLoading(false);
                setAudioUrl(null);
                setError("This download needs re-verifying — buy this track to keep it offline.");
                if (usePlayer.getState().playing) usePlayer.getState().togglePlay();
                return;
              }
              url = obj;
              offline = true;
            }
          }
        } catch {
          offline = false; // corrupt vault copy → fall through to streaming
        }

        if (offline) {
          // Resolved from the vault — nothing more to fetch.
        } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
          // Fail fast while offline: retries would just burn 2s re-hitting
          // an unreachable network before showing the same message.
          setLoading(false);
          setAudioUrl(null);
          setError("You're offline — play a downloaded song or reconnect.");
          if (usePlayer.getState().playing) usePlayer.getState().togglePlay();
          return;
        }

        const cached = !offline && getCachedAudioUrl(track!.id, user?.id ?? null);
        if (cached) {
          url = cached.url;
          previewMode = cached.previewMode;
        } else if (!offline) {
          // Get current access token for entitlement-checked preview of paid tracks.
          const { data: sess } = await supabase.auth.getSession();
          const accessToken = sess.session?.access_token ?? null;

          if (user) {
            let signed: { url: string; requiresPurchase?: boolean } | null = null;
            try {
              signed = await getSignedFn({ data: { song_id: track!.id } });
            } catch {
              signed = null;
            }
            if (signed && signed.url && !signed.requiresPurchase) {
              url = signed.url;
            } else {
              const res = await getPreviewFn({
                data: { song_id: track!.id, access_token: accessToken },
              });
              url = res.url;
              previewMode = true;
            }
          } else {
            // Check if it's a free track first so anonymous listeners hear the full song
            let publicRes: { url: string } | null = null;
            try {
              publicRes = await getPublicFn({ data: { song_id: track!.id } });
            } catch {
              publicRes = null;
            }
            if (publicRes && publicRes.url) {
              url = publicRes.url;
              previewMode = false;
            } else {
              const res = await getPreviewFn({
                data: { song_id: track!.id, access_token: accessToken },
              });
              url = res.url;
              previewMode = true;
            }
          }

          if (!offline && url && /^https?:\/\//i.test(url)) {
            setCachedAudioUrl(track!.id, user?.id ?? null, url, previewMode);
          }
        }


        // A newer selection may have replaced this request while it was
        // resolving. Never publish or play an old track's URL on the new one.
        if (!isCurrentTrack()) return;

        // Validate URL. Offline copies are same-tab Blob URLs (never touch
        // the network); remote URLs must be absolute HTTPS/HTTP so the
        // browser can't resolve a bare filename against the current origin
        // (which caused the OpaqueResponseBlocking errors on wesuplusly.com).
        const isUsableUrl =
          !!url && (offline || /^https?:\/\//i.test(url) || /^blob:/i.test(url));
        if (!isUsableUrl) {
          throw new Error("Audio unavailable (invalid URL)");
        }

        setIsPreview(previewMode);

        if (isNative) {
          if (_nativeAvailable === null) {
            _nativeAvailable = await isNativeAudioAvailable();
          }
          if (_nativeAvailable) {
            // Music-app behavior: background playback + notification /
            // lock-screen controls. Without this the plugin plays in the
            // foreground only, with no system controls.
            await configureNativeAudio().catch(() => {});
            if (!isCurrentTrack()) return;
            // Native plugin cannot play Blob URLs: stage the decrypted
            // vault bytes as an app-private temp file instead.
            let assetUrl = url;
            // file:// (and content://) URIs count as URLs per plugin docs.
            const assetIsUrl = true;
            let nativeViable = true;
            if (offline) {
              const staged = await prepareNativeOfflineTrack(track!.id);
              if (!isCurrentTrack()) {
                // Superseded while staging: drop the orphan instead of
                // leaking it in the cache dir.
                if (staged) await deleteNativeTempFile(staged.path);
                return;
              }
              if (staged) {
                // Same-song reselect stages the identical path — never
                // delete the file we just wrote.
                if (nativeTempPathRef.current !== staged.path) {
                  await deleteNativeTempFile(nativeTempPathRef.current);
                }
                nativeTempPathRef.current = staged.path;
                assetUrl = staged.uri;
              } else {
                // Staging unavailable (no Filesystem plugin / corrupt
                // vault) — fall through to the HTML path below, which
                // plays the Blob URL fine.
                nativeViable = false;
              }
            }
            if (!nativeViable) {
              // Skip the native block without touching availability flags.
            } else {
            // Resolve cover art to a renderable URL for the notification /
            // lock screen. Raw DB storage paths are not playable artwork —
            // covers are decorative, so failures never break playback.
            let artworkUrl: string | undefined;
            try {
              const resolved = await resolveImageUrl("album-art", track!.coverUrl);
              if (resolved) artworkUrl = resolved;
            } catch {
              /* ignore */
            }
            if (!isCurrentTrack()) return;
            const albumTitle = (meta as any)?.albums?.title ?? (meta as any)?.album_title;
            const preloaded = await preloadNative(
              track!.id,
              assetUrl,
              assetIsUrl,
              buildNotificationMetadata({
                title: track!.title,
                artistName: track!.artistName,
                albumTitle: typeof albumTitle === "string" ? albumTitle : null,
                artworkUrl: artworkUrl ?? null,
              }),
            );
            if (!preloaded) {
              // Transient failure (or late plugin registration): re-probe
              // next selection, play via HTML below right now.
              _nativeAvailable = null;
            }
            if (preloaded) {
              if (!isCurrentTrack()) {
                await stopNative(track!.id).catch(() => {});
                return;
              }
              // Native playback is ready only after preload succeeds.
              // For offline tracks the marker is the staged file URI.
              setAudioUrl(assetUrl);
              if (usePlayer.getState().playing) {
                const started = await playNative(track!.id).catch(() => false);
                if (!started) noteNativeStartFailure();
                else if (nativeRetryRef.current === currentSelectionRef.current) {
                  nativeRetryRef.current = null;
                }
              }
              setLoading(false);
              if (user && !previewMode && trackedHistoryTrackRef.current !== track!.id) {
                trackedHistoryTrackRef.current = track!.id;
                recordPlayFn({ data: { song_id: track!.id, progress_seconds: 0 } }).catch(() => {});
              }
              if (previewMode) {
                const previewSelection = selectionId;
                previewTimerRef.current = setTimeout(() => {
                  // Stale timer (track changed) or paused meanwhile: a
                  // preview must never cut off another selection or error
                  // while paused.
                  if (currentSelectionRef.current !== previewSelection) return;
                  const st = usePlayer.getState();
                  if (!st.playing) return;
                  stopNative(track!.id).catch(() => {});
                  st.togglePlay();
                  setError("Preview ended. Buy this track for full access.");
                }, 15000);
              }
              const cleanup = await onNativeComplete(track!.id, () => {
                if (usePlayer.getState().repeat === "one") {
                  // Restart from 0 — replaying a completed asset directly
                  // is plugin-dependent.
                  seekNative(track!.id, 0).catch(() => {});
                  playNative(track!.id).catch(() => {});
                  return;
                }
                usePlayer.getState().skipNext();
                if (track && user && !previewMode) {
                  updatePlayProgressFn({
                    data: {
                      song_id: track!.id,
                      progress_seconds: Math.floor(track.durationSeconds ?? 0),
                    },
                  }).catch(() => {});
                  incrementFn({ data: { song_id: track!.id } }).catch(() => {});
                }
              });
              if (!isCurrentTrack()) {
                cleanup();
                await stopNative(track!.id).catch(() => {});
                return;
              }
              // Native engine drives position now (the HTML element has no
              // src on this path): mirror position + duration into the store
              // so progress bars, seek, and previews keep working.
              const timeCleanup = await onNativeTimeUpdate(track!.id, (seconds) => {
                if (currentTrackIdRef.current !== track!.id) return;
                const st = usePlayer.getState();
                if (st.isPreview && seconds >= 15) {
                  // Backstop for the wall-clock timer: a preview must never
                  // play past 15s even if the timer misfires (entitlement).
                  stopNative(track!.id).catch(() => {});
                  if (st.playing) {
                    usePlayer.setState({ playing: false, progressSeconds: 0 });
                  }
                  setError("Preview ended. Buy this track for full access.");
                  return;
                }
                setProgress(Math.floor(seconds));
              });
              getNativeDuration(track!.id)
                .then((d) => {
                  if (d && currentTrackIdRef.current === track!.id) {
                    setAudioDuration(d);
                    durationRef.current = d;
                    usePlayer.getState().setTrackDuration(d);
                  }
                })
                .catch(() => {});
              nativeCleanupRef.current = () => {
                cleanup();
                timeCleanup();
              };
              return;
              } // preloaded
            } // nativeViable
          } // _nativeAvailable
        } // isNative

        // Attach event-driven loading state so the spinner clears the moment
        // the browser reports the media is ready — not just when play() resolves.
        const cleanupEvents = () => {
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("playing", onPlaying);
          audio.removeEventListener("play", onPlay);
          audio.removeEventListener("error", onError);
          if (audioEventsCleanupRef.current === cleanupEvents) {
            audioEventsCleanupRef.current = null;
          }
        };
        const onCanPlay = () => {
          if (isCurrentTrack()) {
            setLoading(false);
            if (
              usePlayer.getState().playing &&
              audio.paused &&
              audio.src &&
              !audio.src.startsWith("data:")
            ) {
              audio.play().catch(() => {});
            }
          }
        };
        const onPlay = () => {
          if (isCurrentTrack()) setLoading(false);
        };
        const onPlaying = () => {
          if (!isCurrentTrack()) return;
          setLoading(false);
          // Log the play to build a personalized "Recently Played" shelf.
          if (user && !previewMode && trackedHistoryTrackRef.current !== track!.id) {
            trackedHistoryTrackRef.current = track!.id;
            recordPlayFn({ data: { song_id: track!.id, progress_seconds: 0 } }).catch(() => {});
          }
        };
        const onError = () => {
          if (!isCurrentTrack()) return;
          cleanupEvents();
          setLoading(false);
          setAudioUrl(null);
          setError("Failed to load audio. Please try again.");
          if (usePlayer.getState().playing) usePlayer.getState().togglePlay();
        };
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("error", onError);
        audioEventsCleanupRef.current = cleanupEvents;

        audio.src = url;
        audio.volume = muted ? 0 : volume;
        // The source is now attached, so mobile controls can safely enable
        // pause/play even if autoplay is blocked by the browser.
        setAudioUrl(url);
        try {
          if (usePlayer.getState().playing) {
            await audio.play();
          }
          setLoading(false);
        } catch (playErr) {
          setLoading(false);
          if ((playErr as DOMException)?.name === "NotAllowedError") {
            // Keep playing: true! Do NOT kill playback state.
            // When user taps anywhere on the document or canplay arrives, it will immediately play.
            console.warn("Autoplay deferred by browser policy, awaiting user interaction");
          } else {
            throw playErr;
          }
        }

        if (!isCurrentTrack()) return;
      } catch (err) {
        if (!isCurrentTrack()) return;
        if (retries < 2) {
          retries++;
          // Clear stale event handlers before retrying or they duplicate.
          audioEventsCleanupRef.current?.();
          audioEventsCleanupRef.current = null;
          await new Promise((r) => setTimeout(r, 1000));
          return loadUrl();
        }
        setLoading(false);
        setAudioUrl(null);
        setError((err as Error).message);
        if (usePlayer.getState().playing) usePlayer.getState().togglePlay();
      }
    }
    loadUrl();
    // selectionId (not the track id) drives reloads so same-song
    // re-selections can't be swallowed by the "same id" early-return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, selectionId, retryNonce, user?.id]);

  // Backfill missing cover art for the current track + queue. Not every
  // play entry point builds a complete track object, so some queue rows
  // arrive with coverUrl undefined and render the placeholder ("sometimes
  // no cover"). One batched lookup fills them all — including duplicates,
  // which share the same song id.
  useEffect(() => {
    const missing = new Set<string>();
    if (track && !track.coverUrl) missing.add(track.id);
    for (const t of queue) {
      if (!t.coverUrl) {
        missing.add(t.id);
        if (missing.size >= 100) break;
      }
    }
    if (missing.size === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("songs")
          .select("id,cover_url")
          .in("id", [...missing]);
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const r of data as any[]) {
          if (r?.id && r?.cover_url) map[r.id] = r.cover_url;
        }
        if (!cancelled && Object.keys(map).length > 0) {
          usePlayer.getState().hydrateTrackCovers(map);
        }
      } catch {
        /* covers are decorative — never break playback for them */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, selectionId, queue]);

  // Sync playing state
  useEffect(() => {
    const audio = getAudio();
    if (!track) return;
    async function syncPlayState() {
      if (!track) return;
      // While the new URL is still resolving, never touch the element: the
      // src is either empty or belonged to the previous song. Touching it
      // here is what resumed the OLD song on every track change.
      if (track.audioUrl === undefined) return;
      // Pressing play on a failed track retries resolution instead of
      // sitting silent on a dead source. The load effect clears `error` when
      // the retry starts, and the error path below drops `playing` on
      // failure, so this can't loop by itself.
      if (playing && track.audioUrl === null && error) {
        setRetryNonce((n) => n + 1);
        return;
      }
      if (isNative && _nativeAvailable && nativeCleanupRef.current) {
        // Pause → play on a live native asset is a resume (play() would
        // restart it). Both stamp the command clock for the reconciler.
        // A refused start (asset unloaded out-of-band) recovers via retry.
        if (playing) {
          const ok = await resumeNative(track.id).catch(() => false);
          if (!ok) noteNativeStartFailure();
        } else await pauseNative(track.id).catch(() => {});
        return;
      }
      if (playing && audio.paused && audio.src) {
        // If preview has ended, replay from 0
        if (usePlayer.getState().isPreview && audio.currentTime >= 15) {
          audio.currentTime = 0;
          setProgress(0);
        }
        audio.play().catch((err) => {
          console.error("Audio play error:", err);
          if (usePlayer.getState().playing) usePlayer.getState().togglePlay();
        });
      } else if (!playing && !audio.paused) {
        audio.pause();
      }
    }
    syncPlayState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, track, isNative, error]);

  // Progress + duration + ended
  useEffect(() => {
    const audio = getAudio();
    const onTimeUpdate = () => {
      const current = audio.currentTime || 0;
      if (usePlayer.getState().isPreview && current >= 15) {
        audio.pause();
        audio.currentTime = 0;
        setProgress(0);
        usePlayer.setState({ playing: false, progressSeconds: 0 });
        return;
      }
      setProgress(Math.floor(current));
    };
    const onMeta = () => {
      setAudioDuration(audio.duration || 0);
      durationRef.current = audio.duration || 0;
      // Fill the track's duration so mobile bars/seek work even when the
      // queue entry was built without one.
      if (audio.duration && Number.isFinite(audio.duration)) {
        usePlayer.getState().setTrackDuration(audio.duration);
      }
    };
    const onEnded = () => {
      const st = usePlayer.getState();
      if (track && user && !isPreview) {
        updatePlayProgressFn({
          data: {
            song_id: track.id,
            progress_seconds: Math.floor(audio.currentTime || audio.duration || 0),
          },
        }).catch(() => {});
        incrementFn({ data: { song_id: track.id } }).catch(() => {});
      }
      if (st.repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch((err) => {
          console.error("Audio replay error:", err);
        });
        return;
      }
      st.skipNext();
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, isPreview]);

  // Volume
  useEffect(() => {
    getAudio().volume = muted ? 0 : volume;
    if (isNative && _nativeAvailable && currentTrackIdRef.current && nativeCleanupRef.current) {
      setNativeVolume(currentTrackIdRef.current, muted ? 0 : volume).catch(() => {});
    }
  }, [volume, muted, isNative, track?.id]);

  // Bridge store seeks onto the native engine (the store only drives the
  // HTML element, which has no src on the native path).
  useEffect(() => {
    if (!isNative) return;
    setNativeSeekHook((seconds) => {
      const id = currentTrackIdRef.current;
      if (_nativeAvailable && id && nativeCleanupRef.current) {
        seekNative(id, seconds).catch(() => {});
      }
    });
    return () => setNativeSeekHook(null);
  }, [isNative]);

  // Remote-control reconciler: notification / lock-screen buttons drive the
  // native player directly, bypassing the store. Poll the native truth and
  // adopt it — so the in-app UI never disagrees with what's audible.
  useEffect(() => {
    if (!isNative || !track) return;
    const timer = setInterval(async () => {
      try {
        const id = currentTrackIdRef.current;
        // Keyed on the live selection: same-song A→B→A must never adopt
        // the old asset's truth.
        if (!id || id !== track.id || currentSelectionRef.current !== selectionId) return;
        if (!nativeCleanupRef.current) return;
        const st = usePlayer.getState();
        const nativePlaying = await isNativePlaying(id);
        // Generous grace: slow networks can still be buffering several
        // seconds after resolve. A false sync self-heals on the next tick
        // (native truth wins both directions).
        if (shouldSyncPlaying(st.playing, nativePlaying, Date.now(), getLastNativeCommandAt(), 4000)) {
          usePlayer.setState({ playing: !!nativePlaying });
          if (nativePlaying) {
            const pos = await getNativeCurrentTime(id);
            if (pos !== null && currentTrackIdRef.current === id) {
              st.setProgress(Math.floor(pos));
            }
          }
        }
      } catch {
        /* never break playback for telemetry */
      }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative, track?.id, selectionId]);

  // MediaSession — lock-screen / notification controls (web + webview).
  // Artwork must be a renderable URL: raw DB storage paths are not, so the
  // cover is resolved exactly like <StorageImage> does. Without this the
  // lock screen shows controls with no art.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
        if (!track) {
          // No track: clear stale handlers so lock-screen buttons can't
          // resurrect playback after exit.
          try {
            for (const action of [
              "play",
              "pause",
              "previoustrack",
              "nexttrack",
              "seekbackward",
              "seekforward",
              "seekto",
            ] as const) {
              navigator.mediaSession.setActionHandler(action, null);
            }
          } catch {
            /* ignore */
          }
          return;
        }
        let artwork: string | undefined;
        try {
          const resolved = await resolveImageUrl("album-art", track.coverUrl);
          if (!cancelled && resolved) artwork = resolved;
        } catch {
          /* covers are decorative — never break playback for them */
        }
        if (cancelled) return;
        navigator.mediaSession.metadata = new (window as any).MediaMetadata({
          title: track.title,
          artist: track.artistName,
          artwork: artwork ? [{ src: artwork, sizes: "512x512" }] : [],
        });
        const st = () => usePlayer.getState();
        navigator.mediaSession.setActionHandler("play", () => {
          if (!st().playing) st().togglePlay();
        });
        navigator.mediaSession.setActionHandler("pause", () => {
          if (st().playing) st().togglePlay();
        });
        navigator.mediaSession.setActionHandler("previoustrack", () => st().skipPrev());
        navigator.mediaSession.setActionHandler("nexttrack", () => st().skipNext());
        navigator.mediaSession.setActionHandler("seekbackward", (details) => {
          const skip = details.seekOffset || 10;
          st().seekTo(Math.max(0, st().progressSeconds - skip));
        });
        navigator.mediaSession.setActionHandler("seekforward", (details) => {
          const skip = details.seekOffset || 10;
          st().seekTo(st().progressSeconds + skip);
        });
        navigator.mediaSession.setActionHandler("seekto", (details) => {
          const audio = getAudio();
          if (details.seekTime != null) {
            if (audio && audio.src && !audio.src.startsWith("data:")) {
              audio.currentTime = details.seekTime;
            }
            st().seekTo(details.seekTime);
          }
        });
        try {
          (navigator.mediaSession as any).playbackState = st().playing ? "playing" : "paused";
        } catch {
          /* older implementations */
        }
        // Update positionState periodically for lock-screen progress.
        // On the native path the HTML element has no src/duration, so feed
        // the last known native duration + store position instead.
        const updatePosition = () => {
          try {
            const audio = getAudio();
            if (audio && audio.duration && Number.isFinite(audio.duration)) {
              navigator.mediaSession.setPositionState({
                duration: audio.duration,
                playbackRate: audio.playbackRate,
                position: Math.min(audio.currentTime, audio.duration),
              });
              return;
            }
            const dur = durationRef.current;
            const pos = usePlayer.getState().progressSeconds;
            if (dur > 0 && Number.isFinite(dur)) {
              navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: 1,
                position: Math.min(pos, dur),
              });
            }
          } catch { /* ignore */ }
        };
        const audio = getAudio();
        audio?.addEventListener("timeupdate", updatePosition);
        // Remove the timeupdate listener when this track's session is replaced.
        const detach = () => audio?.removeEventListener("timeupdate", updatePosition);
        if (cancelled) detach();
        else trackSessionDetachRef.current = detach;
      } catch {
        /* ignore — unsupported browsers */
      }
    })();
    return () => {
      cancelled = true;
      trackSessionDetachRef.current?.();
      trackSessionDetachRef.current = null;
    };
  }, [track?.id, track?.title, track?.artistName, track?.coverUrl]);

  // Keep the lock-screen play/pause glyph in sync with the store.
  useEffect(() => {
    try {
      if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
      (navigator.mediaSession as any).playbackState = !track
        ? "none"
        : playing
          ? "playing"
          : "paused";
    } catch {
      /* ignore — unsupported browsers */
    }
  }, [playing, track?.id]);

  // Resume playback on user gesture if browser deferred autoplay
  useEffect(() => {
    const handleGestureResume = () => {
      const st = usePlayer.getState();
      const audio = getAudio();
      if (st.playing && audio && audio.paused && audio.src && !audio.src.startsWith("data:")) {
        audio.play().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", handleGestureResume, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleGestureResume);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentTrackIdRef.current) {
        stopNative(currentTrackIdRef.current).catch(() => {});
      }
      audioEventsCleanupRef.current?.();
      nativeCleanupRef.current?.();
      deleteNativeTempFile(nativeTempPathRef.current).catch(() => {});
      nativeTempPathRef.current = null;
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
      }
      // Never destroy the shared singleton's src on unmount — the bar stays
      // mounted across routes by design, and an error-boundary reset must not
      // wipe playback position. Pause only; exitSong() is the explicit stop.
      try {
        getAudio()?.pause();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (audioOnly) return null;
  if (!track) return null;

  const dur = isPreview ? 15 : audioDuration || track.durationSeconds || 0;
  const progressPct = dur > 0 ? Math.min((progressSeconds / dur) * 100, 100) : 0;

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetDur = isPreview ? 15 : dur;
    // Route through the store so preview clamping + empty-src guards apply.
    usePlayer.getState().seekTo(pct * targetDur);
  }

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <>
      {/* Expanded Now Playing (desktop layout) */}
      {isExpanded && (
        <div className="fixed inset-0 bg-gradient-to-b from-background to-background/95 z-[100] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Minimize player"
            >
              <Minimize2 className="size-5" />
            </button>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Now Playing
            </p>
            <button
              onClick={() => {
                usePlayer.getState().exitSong();
                setIsExpanded(false);
              }}
              className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Exit song"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {/* Left side: Full cover art */}
            <div className="flex-1 flex items-center justify-center p-8">
              <StorageImage
                bucket="album-art"
                path={track.coverUrl}
                alt={track.title}
                className="max-h-[70vh] w-auto rounded-lg overflow-hidden shadow-2xl bg-card object-contain"
              />
            </div>

            {/* Center: Controls */}
            <div className="w-96 flex flex-col justify-center p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {albumId ? (
                    <Link
                      to="/albums/$id"
                      params={{ id: albumId }}
                      onClick={() => setIsExpanded(false)}
                      className="block hover:underline"
                    >
                      <h2 className="text-2xl font-bold truncate">{track.title}</h2>
                    </Link>
                  ) : artistId ? (
                    <Link
                      to="/artists/$id"
                      params={{ id: artistId }}
                      onClick={() => setIsExpanded(false)}
                      className="block hover:underline"
                    >
                      <h2 className="text-2xl font-bold truncate">{track.title}</h2>
                    </Link>
                  ) : (
                    <h2 className="text-2xl font-bold truncate">{track.title}</h2>
                  )}
                  {artistId ? (
                    <Link
                      to="/artists/$id"
                      params={{ id: artistId }}
                      onClick={() => setIsExpanded(false)}
                      className="block text-lg text-muted-foreground truncate hover:text-foreground hover:underline"
                    >
                      {track.artistName}
                    </Link>
                  ) : (
                    <p className="text-lg text-muted-foreground truncate">{track.artistName}</p>
                  )}
                </div>
                {user && (
                  <button
                    onClick={toggleLike}
                    className="shrink-0 ml-4"
                    aria-label={liked ? "Unlike" : "Like"}
                  >
                    <Heart
                      className={`size-6 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`}
                    />
                  </button>
                )}
              </div>
              {isPreview && trackPrice > 0 && (
                <Link
                  to="/checkout"
                  search={{ item: "song", id: track.id }}
                  onClick={() => setIsExpanded(false)}
                  className="block w-full text-center py-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold hover:bg-amber-500/30 transition-colors"
                >
                  Buy this track — ZMW {trackPrice.toFixed(2)}
                </Link>
              )}
              <div className="space-y-2">
                <div
                  className="h-1.5 bg-muted rounded-full relative overflow-hidden cursor-pointer group"
                  onClick={seek}
                  role="slider"
                  aria-valuemin={0}
                  aria-valuemax={dur}
                  aria-valuenow={progressSeconds}
                  aria-label="Seek"
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{fmt(progressSeconds)}</span>
                  <span>{fmt(dur)}</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={toggleShuffle}
                  className={`transition-colors ${shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  aria-label="Shuffle"
                >
                  <Shuffle className="size-5" />
                </button>
                <button
                  onClick={skipPrev}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Previous"
                >
                  <SkipBack className="size-6" />
                </button>
                <button
                  // Stays enabled on error: pressing play retries a failed
                  // load (retryNonce) instead of sitting dead.
                  onClick={() => !loading && togglePlay()}
                  disabled={loading}
                  className="bg-foreground text-background p-4 rounded-full hover:scale-105 transition-transform disabled:opacity-30"
                  aria-label={playing ? "Pause" : "Play"}
                  title={error ? "Retry" : undefined}
                >
                  {playing ? (
                    <Pause className="size-6" />
                  ) : loading ? (
                    <Loader2 className="size-6 animate-spin" />
                  ) : (
                    <Play className="size-6 ml-0.5" />
                  )}
                </button>
                <button
                  onClick={skipNext}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Next"
                >
                  <SkipForward className="size-6" />
                </button>
                <button
                  onClick={cycleRepeat}
                  className={`transition-colors ${repeat !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  aria-label="Repeat"
                >
                  {repeat === "one" ? (
                    <Repeat1 className="size-5" />
                  ) : (
                    <Repeat className="size-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Right side: Vertical volume and Queue */}
            <div className="w-20 border-l border-border bg-muted/20 flex flex-col">
              {/* Vertical volume slider */}
              <div className="flex-1 flex flex-col items-center justify-center py-8">
                <button
                  onClick={toggleMute}
                  className="mb-4 text-muted-foreground hover:text-foreground"
                  aria-label="Mute"
                >
                  <VolIcon className="size-5" />
                </button>
                <div className="h-48 w-1 bg-muted rounded-full relative">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={muted ? 0 : volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
                    style={{
                      WebkitAppearance: "slider-vertical",
                      accentColor: "hsl(var(--primary))",
                    }}
                    aria-label="Volume"
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-primary rounded-full transition-all"
                    style={{ height: `${(muted ? 0 : volume) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Far right: Queue */}
            <div className="w-96 border-l border-border bg-muted/20 p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Queue</h3>
                <span className="text-sm text-muted-foreground">{queue.length} songs</span>
              </div>
              {queue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Queue is empty</p>
              ) : (
                <div className="space-y-2">
                  {queue.map((queueTrack, index) => (
                    <button
                      key={`${queueTrack.id}-${index}`}
                      // Always re-select: tapping the current row restarts a
                      // finished/errored track (selectionId forces reload).
                      onClick={() => {
                        usePlayer.getState().setQueue(queue, index);
                      }}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                        index === queueIndex ? "bg-primary/10" : "hover:bg-accent"
                      }`}
                    >
                      <StorageImage
                        bucket="album-art"
                        path={queueTrack.coverUrl}
                        alt={queueTrack.title}
                        className="size-10 rounded overflow-hidden bg-card object-cover"
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <p
                          className={`text-sm font-medium truncate ${index === queueIndex ? "text-primary" : ""}`}
                        >
                          {queueTrack.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {queueTrack.artistName}
                        </p>
                      </div>
                      {index === queueIndex && playing && (
                        <div className="flex items-center gap-0.5">
                          <div className="w-0.5 h-3 bg-primary animate-pulse" />
                          <div className="w-0.5 h-3 bg-primary animate-pulse delay-75" />
                          <div className="w-0.5 h-3 bg-primary animate-pulse delay-150" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {error && (
            <div className="p-4 text-sm text-destructive text-center border-t border-border">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Desktop floating glass bar */}
      <div className="fixed bottom-3 inset-x-3 z-50">
      <div className="bg-obsidian/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_-2px_24px_rgba(0,0,0,0.5)] overflow-hidden">
        {isPreview && (
          <div className="flex items-center justify-between px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs">
            <span className="flex items-center gap-1.5 text-amber-400">
              <Radio className="size-3" /> 15-second preview
            </span>
            <div className="flex items-center gap-3">
              {trackPrice > 0 && (
                <Link
                  to="/checkout"
                  search={{ item: "song", id: track.id }}
                  className="font-semibold text-amber-400 hover:underline"
                >
                  Buy this track — ZMW {trackPrice.toFixed(2)}
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="h-20 px-4 grid grid-cols-3 items-center gap-4">
          {/* Left: Track info */}
          <div className="flex items-center gap-3 min-w-0">
            <StorageImage
              bucket="album-art"
              path={track.coverUrl}
              alt={track.title}
              className="size-14 rounded-md overflow-hidden bg-card shrink-0 ring-1 ring-white/10 object-cover cursor-pointer"
              onClick={() => setIsExpanded(true)}
            />
            <div className="min-w-0 overflow-hidden">
              {albumId ? (
                <Link
                  to="/albums/$id"
                  params={{ id: albumId }}
                  className="text-sm font-medium text-white truncate hover:underline block"
                >
                  {track.title}
                </Link>
              ) : artistId ? (
                <Link
                  to="/artists/$id"
                  params={{ id: artistId }}
                  className="text-sm font-medium text-white truncate hover:underline block"
                >
                  {track.title}
                </Link>
              ) : (
                <p
                  className="text-sm font-medium text-white truncate hover:underline cursor-pointer"
                  onClick={() => setIsExpanded(true)}
                >
                  {track.title}
                </p>
              )}

              {artistId ? (
                <Link
                  to="/artists/$id"
                  params={{ id: artistId }}
                  className="text-xs text-gray-300 truncate hover:text-white hover:underline block"
                >
                  {track.artistName}
                </Link>
              ) : (
                <p className="text-xs text-gray-300 truncate">{track.artistName}</p>
              )}
            </div>
            <div className="flex items-center gap-2 relative z-10">
              {user && (
                <button
                  onClick={toggleLike}
                  className="shrink-0 p-1.5 rounded-full hover:bg-white/10"
                  aria-label={liked ? "Unlike" : "Like"}
                >
                  <Heart
                    className={`size-4 ${liked ? "fill-primary text-primary" : "text-gray-300 hover:text-white"}`}
                  />
                </button>
              )}
              <ShareMenu
                songId={track.id}
                songTitle={track.title}
                coverUrl={track.coverUrl}
                artistId={artistId}
                artistName={track.artistName}
                albumId={albumId}
                type="song"
                className="relative z-20"
              />
            </div>
          </div>

          {/* Center: Controls + progress */}
          <div className="flex flex-col items-center gap-1.5 w-full">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleShuffle}
                className={`transition-colors ${shuffle ? "text-primary" : "text-gray-300 hover:text-white"}`}
                aria-label="Shuffle"
                title="Shuffle"
              >
                <Shuffle className="size-4" />
              </button>
              <button
                onClick={skipPrev}
                className="text-gray-300 hover:text-white"
                aria-label="Previous"
                title="Previous"
              >
                <SkipBack className="size-4" />
              </button>
              <button
                // Stays enabled on error: pressing play retries a failed load.
                onClick={() => !loading && togglePlay()}
                disabled={loading}
                className="bg-white text-black p-2 rounded-full hover:scale-105 transition-transform disabled:opacity-30"
                aria-label={playing ? "Pause" : "Play"}
                title={error ? "Retry" : undefined}
              >
                {playing ? (
                  <Pause className="size-4" />
                ) : loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4 ml-0.5" />
                )}
              </button>
              <button
                onClick={skipNext}
                className="text-gray-300 hover:text-white"
                aria-label="Next"
                title="Next"
              >
                <SkipForward className="size-4" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`transition-colors ${repeat !== "off" ? "text-primary" : "text-gray-300 hover:text-white"}`}
                aria-label="Repeat"
                title={`Repeat: ${repeat}`}
              >
                {repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
              </button>
            </div>
            <div className="w-full flex items-center gap-2">
              <span className="text-[10px] text-gray-300 tabular-nums w-8 text-right">
                {fmt(progressSeconds)}
              </span>
              <div
                className="flex-1 h-1 bg-gray-600 rounded-full relative overflow-hidden cursor-pointer group"
                onClick={seek}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={dur}
                aria-valuenow={progressSeconds}
                aria-label="Seek"
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-white group-hover:bg-primary transition-colors"
                  style={{ width: `${progressPct}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progressPct}% - 6px)` }}
                />
              </div>
              <span className="text-[10px] text-gray-300 tabular-nums w-8">{fmt(dur)}</span>
            </div>
            {error && <p className="text-[10px] text-destructive truncate max-w-md">{error}</p>}
          </div>

          {/* Right: Queue, volume, expand */}
          <div className="flex items-center justify-end gap-3">
            <Link
              to="/queue"
              className="text-gray-300 hover:text-white p-1.5 rounded-full hover:bg-white/10"
              aria-label="Queue"
              title="Queue"
            >
              <ListMusic className="size-4" />
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-gray-300 hover:text-white"
                aria-label="Mute"
              >
                <VolIcon className="size-4" />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-24 accent-white"
                aria-label="Volume"
              />
            </div>
            <button
              onClick={() => setIsExpanded(true)}
              className="text-gray-300 hover:text-white p-1.5 rounded-full hover:bg-white/10"
              aria-label="Expand"
              title="Now playing"
            >
              <Maximize2 className="size-4" />
            </button>
            <button
              onClick={() => usePlayer.getState().exitSong()}
              className="text-gray-300 hover:text-white p-1.5 rounded-full hover:bg-white/10"
              aria-label="Close"
              title="Close player"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
