import { create } from "zustand";
import { persist } from "zustand/middleware";
import { primeAudio, getAudio } from "@/lib/audio";
import { emitNativeSeek, setNativeSeekHook } from "@/lib/native-audio";
import {
  addToShuffleDeck,
  buildShuffleDeck,
  insertIndexForPlayNext,
  pickNextIndex,
  rebuildShuffleDeck,
  remapShuffleDeck,
  type RepeatMode,
  type ShuffleDeck,
} from "@/stores/play-order";
import { offlineModeEnabled } from "@/stores/offline-mode";
import { getCachedVaultIds, isVaultIndexReady } from "@/lib/vault-index";
import { planOfflineQueue } from "@/lib/offline-queue";

export type { ShuffleDeck };

export interface PlayerTrack {
  id: string;
  title: string;
  artistName: string;
  coverUrl?: string | null;
  audioUrl?: string | null;
  durationSeconds?: number | null;
  price?: number | null;
}

// RepeatMode is defined once, in play-order.ts, next to the logic that reads
// it. Re-exported here because the store's public type surface is this module.
export type { RepeatMode } from "@/stores/play-order";

function preserveResolvedAudioUrl(
  next: PlayerTrack | null,
  current: PlayerTrack | null,
  currentIsPreview = false,
): PlayerTrack | null {
  if (!next || !current || next.id !== current.id || next.audioUrl !== undefined) {
    return next;
  }
  // Never carry a preview (short, expiring) URL into a new selection —
  // the engine would briefly play the stale preview while re-resolving.
  if (currentIsPreview) {
    return { ...next, audioUrl: undefined };
  }
  return { ...next, audioUrl: current.audioUrl };
}

interface PlayerState {
  track: PlayerTrack | null;
  queue: PlayerTrack[];
  queueIndex: number;
  /**
   * Monotonic token bumped on every explicit track selection (setTrack,
   * setQueue, skipNext/Prev, removing the current track). The audio engine
   * keys resolution off this — not the track id — so re-selecting the SAME
   * song (queue duplicates, retry after a failed load) always reloads
   * instead of hitting the "same id, do nothing" early-return. Never
   * persisted: it only orders selections within a live session.
   */
  selectionId: number;
  playing: boolean;
  progressSeconds: number;
  nowPlayingOpen: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /**
   * The shuffle deck: which queue positions are still unplayed, and the one
   * currently playing. Held here (not recomputed per skip) so shuffle draws
   * without replacement — see play-order.ts for why that matters.
   */
  shuffleDeck: ShuffleDeck | null;
  /** Playback error, in words a listener can act on. */
  error: string | null;
  /** Bumped by `retry` to force a fresh resolve of the current track. */
  retryNonce: number;
  isPreview: boolean;
  setIsPreview: (v: boolean) => void;
  setTrack: (t: PlayerTrack | null) => void;
  /**
   * Update the resolved audio URL for the active track.
   *
   * `undefined` means the URL is still being resolved, while `null` means
   * resolution failed or the track has no playable source. Mobile controls
   * use this distinction to show a spinner only while a request is in flight.
   */
  setAudioUrl: (url: string | null | undefined) => void;
  setQueue: (tracks: PlayerTrack[], startIndex?: number) => void;
  addToQueue: (track: PlayerTrack) => void;
  removeFromQueue: (index: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  togglePlay: () => void;
  setProgress: (s: number) => void;
  setTrackDuration: (seconds: number) => void;
  hydrateTrackCovers: (covers: Record<string, string>) => void;
  seekTo: (seconds: number) => void;
  /** Insert directly after the current track so it plays next. */
  playNext: (track: PlayerTrack) => void;
  /** Wipe the queue and stop. */
  clearQueue: () => void;
  /** Move a queue entry, keeping queueIndex pointing at the same track. */
  moveInQueue: (from: number, to: number) => void;
  /** Report a playback failure in language the listener can act on. */
  setError: (message: string | null) => void;
  /** Re-resolve and restart the current track. */
  retry: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  exitSong: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      track: null,
      queue: [],
      queueIndex: 0,
      selectionId: 0,
      playing: false,
      progressSeconds: 0,
      nowPlayingOpen: false,
      volume: 1,
      muted: false,
      shuffle: false,
      repeat: "off",
      shuffleDeck: null,
      error: null,
      retryNonce: 0,
      isPreview: false,

      setIsPreview: (v) => set({ isPreview: v }),
      setTrack: (t) => {
        if (t) primeAudio();
        set((state) => ({
          track: preserveResolvedAudioUrl(t, state.track, state.isPreview),
          selectionId: t ? state.selectionId + 1 : state.selectionId,
          playing: !!t,
          progressSeconds: 0,
          isPreview: false,
          // A previous track's failure must not turn this one's Play button
          // into a retry: togglePlay read the stale error and restarted from
          // 0:00 instead of pausing.
          error: null,
        }));
      },
      setAudioUrl: (url) =>
        set((state) => (state.track ? { track: { ...state.track, audioUrl: url } } : state)),

      setQueue: (tracks, startIndex = 0) => {
        if (!tracks.length) {
          set({
            queue: [],
            queueIndex: 0,
            track: null,
            playing: false,
            progressSeconds: 0,
            shuffleDeck: null,
            error: null,
          });
          return;
        }

        // Offline mode: a queue may only hold tracks that are on this device.
        //
        // Every surface funnels through here, and the shuffle deck is derived
        // from the resulting queue, so this one filter also constrains shuffle
        // and Next/Prev. Without it, tapping a shelf with the mode on builds a
        // queue of tracks that each die on a signed URL they cannot obtain.
        //
        // `isVaultIndexReady` guard: before the first read completes the index
        // is empty, and treating "not read yet" as "nothing downloaded" would
        // wipe the queue of every listener right after a cold start. If the
        // index is not ready, build the queue unfiltered — a wrong queue on the
        // first tap is far better than silence — and the next read corrects it.
        const offlineMode = offlineModeEnabled();
        const plan = planOfflineQueue(
          tracks,
          startIndex,
          offlineMode && isVaultIndexReady(),
          getCachedVaultIds(),
        );

        if (plan.empty) {
          // Nothing playable, but do NOT clear what is currently playing —
          // refusing a new queue should not stop the song already in progress.
          set({
            error: offlineMode
              ? "Offline mode: none of those songs are downloaded on this device."
              : null,
          });
          return;
        }

        const safeIndex = plan.startIndex;
        primeAudio();
        // `plan.tracks`, not `tracks`. Reading from the caller's array while
        // storing the filtered one put the player on a track that was never in
        // the queue: correct by luck whenever nothing was filtered, wrong the
        // moment offline mode removed anything.
        const track = preserveResolvedAudioUrl(
          plan.tracks[safeIndex] ?? null,
          get().track,
          get().isPreview,
        );
        set((state) => ({
          queue: plan.tracks,
          queueIndex: safeIndex,
          track,
          selectionId: track ? state.selectionId + 1 : state.selectionId,
          playing: !!track,
          progressSeconds: 0,
          // The old deck indexes the PREVIOUS queue. Left in place, the next
          // skip drew an index that no longer existed.
          shuffleDeck: rebuildShuffleDeck(state.shuffle, plan.tracks.length, safeIndex),
          error: null,
        }));
      },

      addToQueue: (track) => {
        // Same rule as setQueue: nothing reaches the queue that cannot play.
        if (track && offlineModeEnabled() && isVaultIndexReady()) {
          if (!getCachedVaultIds().has(track.id)) {
            set({
              error: `"${track.title}" is not downloaded on this device.`,
            });
            return;
          }
        }
        if (track) primeAudio();
        set((state) => {
          const at = state.queue.length;
          return {
            queue: [...state.queue, track],
            // Appending does not move existing positions, so the deck stays
            // valid — but the new track has to be reachable under shuffle.
            shuffleDeck: addToShuffleDeck(state.shuffleDeck, at),
          };
        });
      },

      removeFromQueue: (index) => {
        set((state) => {
          const newQueue = state.queue.filter((_, i) => i !== index);
          if (index === state.queueIndex) {
            // Removing the currently playing track. This used to START the
            // next one: every queue mutation that replaced the track set
            // playing:true, so deleting a row silently began playing
            // something else. Spotify never does that — stop instead.
            return {
              queue: newQueue,
              queueIndex: Math.min(index, Math.max(newQueue.length - 1, 0)),
              track: null,
              playing: false,
              progressSeconds: 0,
              isPreview: false,
              error: null,
              shuffleDeck: null,
            };
          }
          const newQueueIndex = state.queueIndex > index ? state.queueIndex - 1 : state.queueIndex;
          return {
            queue: newQueue,
            queueIndex: newQueueIndex,
            // Removing a row shifts every later position down by one, so a deck
            // still pointing at the old numbers could draw past the end.
            shuffleDeck: remapShuffleDeck(state.shuffleDeck, (i) =>
              i === index ? null : i > index ? i - 1 : i,
            ),
          };
        });
      },

      /**
       * "Play next": insert directly after the current track so the listener
       * hears it immediately, rather than at the end of a long queue.
       */
      playNext: (track) => {
        if (track) primeAudio();
        set((state) => {
          const at = insertIndexForPlayNext(state.queue.length, state.queueIndex);
          const queue = [...state.queue];
          queue.splice(at, 0, track);
          return {
            queue,
            // Everything from `at` onwards shifted right by one.
            shuffleDeck: addToShuffleDeck(
              remapShuffleDeck(state.shuffleDeck, (i) => (i >= at ? i + 1 : i)),
              at,
            ),
          };
        });
      },

      clearQueue: () => {
        primeAudio();
        set({
          queue: [],
          queueIndex: 0,
          track: null,
          playing: false,
          progressSeconds: 0,
          isPreview: false,
          error: null,
          shuffleDeck: null,
        });
        const audio = getAudio();
        if (audio) {
          try {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
          } catch {
            /* nothing to stop */
          }
        }
      },

      /**
       * Reorder the queue. The track that is playing KEEPS playing — it is
       * identified by position, so the index is moved with it, otherwise a
       * reorder would start a different song mid-listen.
       */
      moveInQueue: (from, to) => {
        set((state) => {
          const { queue, queueIndex } = state;
          if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) {
            return state;
          }
          const next = queue.slice();
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          // Follow the track that is playing to its new position.
          let index = queueIndex;
          if (queueIndex === from) index = to;
          else if (from < queueIndex && to >= queueIndex) index = queueIndex - 1;
          else if (from > queueIndex && to <= queueIndex) index = queueIndex + 1;
          // A reorder moves rows between two positions, so the deck's stored
          // numbers no longer describe anything. Rebuild it.
          return {
            queue: next,
            queueIndex: index,
            shuffleDeck: rebuildShuffleDeck(state.shuffle, next.length, index),
          };
        });
      },

      setError: (message) => set({ error: message }),

      /**
       * Retry the current track. Bumping retryNonce forces the engine to drop
       * its cached signed URL and resolve a fresh one — a 403 on an expired
       * URL is otherwise permanent until the app restarts.
       */
      retry: () =>
        set((state) => ({
          error: null,
          playing: true,
          retryNonce: state.retryNonce + 1,
          progressSeconds: 0,
        })),

      skipNext: () => {
        primeAudio();
        const { queue } = get();
        if (!queue.length) return;
        const { index, deck } = pickNextIndex({
          queueLength: queue.length,
          queueIndex: get().queueIndex,
          shuffle: get().shuffle,
          repeat: get().repeat,
          deck: get().shuffleDeck,
        });
        if (index === null) {
          // Nothing playable left and repeat is off: stop honestly rather than
          // leaving a finished track displayed as "playing".
          set({ playing: false, progressSeconds: 0, error: null });
          return;
        }
        set((state) => ({
          queueIndex: index,
          track: preserveResolvedAudioUrl(queue[index], state.track, state.isPreview),
          selectionId: state.selectionId + 1,
          progressSeconds: 0,
          playing: true,
          isPreview: false,
          error: null,
          shuffleDeck: deck,
        }));
      },

      skipPrev: () => {
        primeAudio();
        const { queue, queueIndex, progressSeconds } = get();
        if (progressSeconds > 3) {
          set({ progressSeconds: 0 });
          const audio = getAudio();
          if (audio?.src) audio.currentTime = 0;
          emitNativeSeek(0);
          return;
        }
        if (!queue.length) return;
        const prev = (queueIndex - 1 + queue.length) % queue.length;
        set((state) => ({
          queueIndex: prev,
          track: preserveResolvedAudioUrl(queue[prev], state.track, state.isPreview),
          selectionId: state.selectionId + 1,
          progressSeconds: 0,
          playing: true,
          isPreview: false,
          // Same reason as setTrack: a stale error turned the next Play tap
          // into a retry instead of a pause.
          error: null,
          // The deck's `current` is the row that was playing; it is no longer.
          shuffleDeck: state.shuffleDeck
            ? { ...state.shuffleDeck, current: prev }
            : state.shuffleDeck,
        }));
      },

      togglePlay: () => {
        const { isPreview, progressSeconds, playing, error } = get();
        // A failed track is a retry, not a pause. Toggling here used to leave
        // the listener stuck: the failure path deliberately keeps playing:true
        // (so the UI doesn't lie), so tapping play only set it to false and
        // the button appeared to do nothing at all.
        if (error) {
          get().retry();
          return;
        }
        const audio = getAudio();
        if (!playing) primeAudio();
        // If a 15-second preview has reached the end and user clicks Play, replay from 0
        if (!playing && isPreview && progressSeconds >= 15) {
          if (audio?.src) audio.currentTime = 0;
          emitNativeSeek(0);
          set({ progressSeconds: 0, playing: true });
          return;
        }
        set((s) => ({ playing: !s.playing }));
      },

      setProgress: (s) => set({ progressSeconds: s }),

      /**
       * Fill in missing cover art for the current track / queue entries.
       * Not every play entry point builds a complete track object, so the
       * engine backfills covers from the DB on demand. Never bumps
       * selectionId (this is not a new selection) and no-ops — returning the
       * identical state — when there is nothing to fill, so it can't loop
       * with the effect that calls it.
       */
      hydrateTrackCovers: (covers: Record<string, string>) => {
        set((state) => {
          let changed = false;
          const fill = (t: PlayerTrack): PlayerTrack => {
            const url = covers[t.id];
            if (!t.coverUrl && url) {
              changed = true;
              return { ...t, coverUrl: url };
            }
            return t;
          };
          const track = state.track ? fill(state.track) : state.track;
          // Skip the queue map entirely when the current track was the only
          // thing that could change and didn't.
          let queue = state.queue;
          if (changed || state.queue.some((t) => !t.coverUrl && covers[t.id])) {
            queue = state.queue.map(fill);
          }
          if (!changed && queue === state.queue) return state;
          return { track, queue };
        });
      },

      /**
       * Fill in the real media duration once the element reports metadata.
       * Many queue entries are built without durationSeconds — without this,
       * mobile progress bars and seek stay stuck at 0:00.
       */
      setTrackDuration: (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        set((state) => {
          if (!state.track || state.track.durationSeconds) return state;
          return { track: { ...state.track, durationSeconds: Math.floor(seconds) } };
        });
      },

      seekTo: (seconds: number) => {
        const { isPreview, track } = get();
        const dur = track?.durationSeconds ?? 0;
        // The old clamp used 100000s when the duration was unknown, so a scrub
        // on a track whose length had not loaded yet threw the playhead
        // ~27 hours ahead and playback was effectively dead. Clamp to the real
        // media duration when we have it, and refuse otherwise.
        const engineDuration = getAudio()?.duration;
        const known =
          dur > 0
            ? dur
            : Number.isFinite(engineDuration) && (engineDuration as number) > 0
              ? (engineDuration as number)
              : 0;
        if (isPreview) {
          const target = Math.max(0, Math.min(seconds, 15));
          const audio = getAudio();
          if (audio?.src) audio.currentTime = target;
          emitNativeSeek(target);
          set({ progressSeconds: target });
          return;
        }
        if (known <= 0) return;
        const target = Math.max(0, Math.min(seconds, known));
        const audio = getAudio();
        // The shared element may have no src (native path, or seek before
        // load) — setting currentTime then is a no-op at best.
        if (audio?.src) {
          audio.currentTime = target;
        }
        emitNativeSeek(target);
        set({ progressSeconds: Math.floor(target) });
      },
      openNowPlaying: () => set({ nowPlayingOpen: true }),
      closeNowPlaying: () => set({ nowPlayingOpen: false }),
      exitSong: () => {
        const audio = getAudio();
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        // Stop the native engine too — otherwise audible native playback
        // outlives the UI until the engine effect runs. The id is captured
        // before the track is nulled below. Dynamic import keeps
        // native-audio (and its plugin import) out of bundles that never play.
        const exitingId = get().track?.id ?? null;
        setNativeSeekHook(null);
        import("@/lib/native-audio")
          .then(({ stopNative }) => {
            if (exitingId) stopNative(exitingId).catch(() => {});
          })
          .catch(() => {});
        set({
          track: null,
          playing: false,
          progressSeconds: 0,
          nowPlayingOpen: false,
          isPreview: false,
          // Left set, the NEXT track's Play button was a retry: tapping pause
          // restarted the song instead of pausing it.
          error: null,
        });
      },
      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), muted: v === 0 }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      // Turning shuffle on starts a fresh deck; the old one was built for a
      // different current track, so it could hand back the playing track.
      toggleShuffle: () =>
        set((s) => {
          const shuffle = !s.shuffle;
          return {
            shuffle,
            shuffleDeck: shuffle ? buildShuffleDeck(s.queue.length, s.queueIndex) : null,
          };
        }),
      cycleRepeat: () =>
        set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),
    }),
    {
      name: "wesu-player",
      // Persist queue + prefs across reloads. Never auto-resume
      // audio (browser policy) — restore paused at saved position.
      // Strip the signed audioUrl: it expires, so rehydrate must re-resolve.
      partialize: (s) =>
        ({
          track: s.track ? { ...s.track, audioUrl: undefined } : null,
          queue: s.queue.slice(0, 200).map((t) => ({ ...t, audioUrl: undefined })),
          queueIndex: s.queueIndex,
          volume: s.volume,
          muted: s.muted,
          shuffle: s.shuffle,
          repeat: s.repeat,
          progressSeconds: s.progressSeconds,
        }) as PlayerState,
      merge: (persisted: any, current) => {
        const queue: PlayerTrack[] = persisted?.queue ?? [];
        // A restored queue is capped at 200 entries, so a saved index could
        // point past the end. Clamp rather than render a phantom track.
        const queueIndex = Math.max(
          0,
          Math.min(persisted?.queueIndex ?? 0, Math.max(queue.length - 1, 0)),
        );
        return {
          ...current,
          ...persisted,
          queue,
          queueIndex,
          // The deck is index-based; a stale one from a different queue would
          // hand back a position that no longer means what it did.
          shuffleDeck: null,
          playing: false,
          nowPlayingOpen: false,
          error: null,
          // The audio element is empty after a reload, so the restored
          // position is fiction — showing a progress bar at 2:10 when nothing
          // is loaded is a lie the listener can see.
          progressSeconds: 0,
        };
      },
    },
  ),
);
