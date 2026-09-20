import { create } from "zustand";
import { persist } from "zustand/middleware";
import { primeAudio, getAudio } from "@/lib/audio";
import { emitNativeSeek } from "@/lib/native-audio";

export interface PlayerTrack {
  id: string;
  title: string;
  artistName: string;
  coverUrl?: string | null;
  audioUrl?: string | null;
  durationSeconds?: number | null;
  price?: number | null;
}

export type RepeatMode = "off" | "all" | "one";

function preserveResolvedAudioUrl(
  next: PlayerTrack | null,
  current: PlayerTrack | null,
): PlayerTrack | null {
  if (!next || !current || next.id !== current.id || next.audioUrl !== undefined) {
    return next;
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
  liked: boolean;
  progressSeconds: number;
  nowPlayingOpen: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
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
  toggleLike: () => void;
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
      liked: false,
      progressSeconds: 0,
      nowPlayingOpen: false,
      volume: 1,
      muted: false,
      shuffle: false,
      repeat: "off",
      isPreview: false,

      setIsPreview: (v) => set({ isPreview: v }),
      setTrack: (t) => {
        if (t) primeAudio();
        set((state) => ({
          track: preserveResolvedAudioUrl(t, state.track),
          selectionId: t ? state.selectionId + 1 : state.selectionId,
          playing: !!t,
          progressSeconds: 0,
          liked: false,
          isPreview: false,
        }));
      },
      setAudioUrl: (url) =>
        set((state) => (state.track ? { track: { ...state.track, audioUrl: url } } : state)),

      setQueue: (tracks, startIndex = 0) => {
        if (!tracks.length) {
          set({ queue: [], queueIndex: 0, track: null, playing: false, progressSeconds: 0 });
          return;
        }
        // Clamp out-of-bounds callers instead of storing a queueIndex with no track.
        const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
        if (tracks.length) primeAudio();
        const track = preserveResolvedAudioUrl(tracks[safeIndex] ?? null, get().track);
        set((state) => ({
          queue: tracks,
          queueIndex: safeIndex,
          track,
          selectionId: track ? state.selectionId + 1 : state.selectionId,
          playing: !!track,
          progressSeconds: 0,
          liked: false,
        }));
      },

      addToQueue: (track) => {
        if (track) primeAudio();
        set((state) => ({
          queue: [...state.queue, track],
        }));
      },

      removeFromQueue: (index) => {
        set((state) => {
          const newQueue = state.queue.filter((_, i) => i !== index);
          if (index === state.queueIndex) {
            // Removing the currently playing track — advance to the track
            // now at this position (or stop if the queue is empty).
            const nextTrack = newQueue[Math.min(index, newQueue.length - 1)] ?? null;
            return {
              queue: newQueue,
              queueIndex: Math.min(index, Math.max(newQueue.length - 1, 0)),
              track: nextTrack,
              selectionId: nextTrack ? state.selectionId + 1 : state.selectionId,
              playing: !!nextTrack,
              progressSeconds: 0,
              liked: false,
              isPreview: false,
            };
          }
          const newQueueIndex = state.queueIndex > index ? state.queueIndex - 1 : state.queueIndex;
          return { queue: newQueue, queueIndex: newQueueIndex };
        });
      },

      skipNext: () => {
        primeAudio();
        const { queue, queueIndex, shuffle, repeat } = get();
        if (!queue.length) return;
        let next: number;
        if (shuffle) {
          next = Math.floor(Math.random() * queue.length);
        } else {
          next = queueIndex + 1;
          if (next >= queue.length) {
            if (repeat === "off") {
              // Dead end — stop instead of leaving playing:true on ended audio.
              set({ playing: false });
              return;
            }
            next = 0;
          }
        }
        set((state) => ({
          queueIndex: next,
          track: preserveResolvedAudioUrl(queue[next], state.track),
          selectionId: state.selectionId + 1,
          progressSeconds: 0,
          liked: false,
          playing: true,
          isPreview: false,
        }));
      },

      skipPrev: () => {
        primeAudio();
        const { queue, queueIndex, progressSeconds } = get();
        if (progressSeconds > 3) {
          set({ progressSeconds: 0 });
          const audio = getAudio();
          if (audio) audio.currentTime = 0;
          emitNativeSeek(0);
          return;
        }
        if (!queue.length) return;
        const prev = (queueIndex - 1 + queue.length) % queue.length;
        set((state) => ({
          queueIndex: prev,
          track: preserveResolvedAudioUrl(queue[prev], state.track),
          selectionId: state.selectionId + 1,
          progressSeconds: 0,
          liked: false,
          playing: true,
          isPreview: false,
        }));
      },

      togglePlay: () => {
        const { isPreview, progressSeconds, playing } = get();
        const audio = getAudio();
        if (!playing) primeAudio();
        // If a 15-second preview has reached the end and user clicks Play, replay from 0
        if (!playing && isPreview && progressSeconds >= 15) {
          if (audio) audio.currentTime = 0;
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
        const maxTime = isPreview ? 15 : dur > 0 ? dur : 100000;
        const target = Math.max(0, Math.min(seconds, maxTime));
        const audio = getAudio();
        if (audio) {
          audio.currentTime = target;
        }
        emitNativeSeek(target);
        set({ progressSeconds: Math.floor(target) });
      },

      toggleLike: () => set((s) => ({ liked: !s.liked })),
      openNowPlaying: () => set({ nowPlayingOpen: true }),
      closeNowPlaying: () => set({ nowPlayingOpen: false }),
      exitSong: () => {
        const audio = getAudio();
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        set({
          track: null,
          playing: false,
          progressSeconds: 0,
          liked: false,
          nowPlayingOpen: false,
          isPreview: false,
        });
      },
      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), muted: v === 0 }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
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
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        playing: false,
        nowPlayingOpen: false,
        liked: false,
      }),
    },
  ),
);
