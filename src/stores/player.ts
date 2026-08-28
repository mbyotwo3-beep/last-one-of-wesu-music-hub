import { create } from "zustand";

export interface PlayerTrack {
  id: string;
  title: string;
  artistName: string;
  coverUrl?: string | null;
  audioUrl?: string | null;
  durationSeconds?: number | null;
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
  skipNext: () => void;
  skipPrev: () => void;
  togglePlay: () => void;
  setProgress: (s: number) => void;
  toggleLike: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  exitSong: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  track: null,
  queue: [],
  queueIndex: 0,
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
  setTrack: (t) =>
    set((state) => ({
      track: preserveResolvedAudioUrl(t, state.track),
      playing: !!t,
      progressSeconds: 0,
      liked: false,
      isPreview: false,
    })),
  setAudioUrl: (url) =>
    set((state) => (state.track ? { track: { ...state.track, audioUrl: url } } : state)),

  setQueue: (tracks, startIndex = 0) => {
    const track = preserveResolvedAudioUrl(tracks[startIndex] ?? null, get().track);
    set({ queue: tracks, queueIndex: startIndex, track, playing: !!track, progressSeconds: 0, liked: false });
  },

  skipNext: () => {
    const { queue, queueIndex, shuffle, repeat } = get();
    if (!queue.length) return;
    let next: number;
    if (shuffle) {
      next = Math.floor(Math.random() * queue.length);
    } else {
      next = queueIndex + 1;
      if (next >= queue.length) {
        if (repeat === "off") return;
        next = 0;
      }
    }
    set((state) => ({
      queueIndex: next,
      track: preserveResolvedAudioUrl(queue[next], state.track),
      progressSeconds: 0,
      liked: false,
      playing: true,
    }));
  },

  skipPrev: () => {
    const { queue, queueIndex, progressSeconds } = get();
    if (progressSeconds > 3) {
      set({ progressSeconds: 0 });
      const audio = (window as any).__wesuAudio as HTMLAudioElement | undefined;
      if (audio) audio.currentTime = 0;
      return;
    }
    if (!queue.length) return;
    const prev = (queueIndex - 1 + queue.length) % queue.length;
    set((state) => ({
      queueIndex: prev,
      track: preserveResolvedAudioUrl(queue[prev], state.track),
      progressSeconds: 0,
      liked: false,
      playing: true,
    }));
  },

  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setProgress: (s) => set({ progressSeconds: s }),
  toggleLike: () => set((s) => ({ liked: !s.liked })),
  openNowPlaying: () => set({ nowPlayingOpen: true }),
  closeNowPlaying: () => set({ nowPlayingOpen: false }),
  exitSong: () => {
    const audio = (window as any).__wesuAudio as HTMLAudioElement | undefined;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    set({
      track: null,
      playing: false,
      progressSeconds: 0,
      liked: false,
      nowPlayingOpen: false,
    });
  },
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), muted: v === 0 }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),
}));
