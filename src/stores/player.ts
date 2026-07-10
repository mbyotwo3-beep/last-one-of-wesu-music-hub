import { create } from "zustand";

export interface PlayerTrack {
  id: string;
  title: string;
  artistName: string;
  coverUrl?: string | null;
  audioUrl?: string | null;
  durationSeconds?: number | null;
}

interface PlayerState {
  track: PlayerTrack | null;
  queue: PlayerTrack[];
  queueIndex: number;
  playing: boolean;
  liked: boolean;
  progressSeconds: number;
  nowPlayingOpen: boolean;
  setTrack: (t: PlayerTrack | null) => void;
  setQueue: (tracks: PlayerTrack[], startIndex?: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  togglePlay: () => void;
  setProgress: (s: number) => void;
  toggleLike: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  exitSong: () => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  track: null,
  queue: [],
  queueIndex: 0,
  playing: false,
  liked: false,
  progressSeconds: 0,
  nowPlayingOpen: false,

  setTrack: (t) => set({ track: t, playing: !!t, progressSeconds: 0, liked: false }),

  setQueue: (tracks, startIndex = 0) => {
    const track = tracks[startIndex] ?? null;
    set({ queue: tracks, queueIndex: startIndex, track, playing: !!track, progressSeconds: 0, liked: false });
  },

  skipNext: () => {
    const { queue, queueIndex } = get();
    if (!queue.length) return;
    const next = (queueIndex + 1) % queue.length;
    set({ queueIndex: next, track: queue[next], progressSeconds: 0, liked: false, playing: true });
  },

  skipPrev: () => {
    const { queue, queueIndex, progressSeconds } = get();
    // If > 3s in, restart current track; otherwise go to prev
    if (progressSeconds > 3) {
      set({ progressSeconds: 0 });
      const audio = (window as any).__wesuAudio as HTMLAudioElement | undefined;
      if (audio) audio.currentTime = 0;
      return;
    }
    if (!queue.length) return;
    const prev = (queueIndex - 1 + queue.length) % queue.length;
    set({ queueIndex: prev, track: queue[prev], progressSeconds: 0, liked: false, playing: true });
  },

  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setProgress: (s) => set({ progressSeconds: s }),
  toggleLike: () => set((s) => ({ liked: !s.liked })),
  openNowPlaying: () => set({ nowPlayingOpen: true }),
  closeNowPlaying: () => set({ nowPlayingOpen: false }),
  exitSong: () => {
    // Also stop audio element
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
}));
