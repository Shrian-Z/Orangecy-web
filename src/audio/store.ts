import { create } from 'zustand';
import type { LyricLine, PlayInfo, SeekCheck, Song, Toast } from '@/types';

interface AudioState {
  song: Song | null;
  lines: LyricLine[];
  playInfo: PlayInfo | null;
  loadingSong: boolean;
  queue: Song[];
  queueIndex: number;

  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  audioReady: boolean;

  seekCheck: SeekCheck | null;
  toasts: Toast[];

  beginLoad: (song: Song) => void;
  finishLoad: (song: Song, lines: LyricLine[], playInfo: PlayInfo) => void;
  setQueue: (songs: Song[], index: number) => void;
  setPlaying: (value: boolean) => void;
  setTime: (currentTime: number, duration?: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (value: number) => void;
  setAudioReady: (value: boolean) => void;
  setSeekCheck: (check: SeekCheck) => void;
  pushToast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

/**
 * Audio organ store. It keeps the source controller's state exactly as the old
 * shell had it, minus auth / view / drawer / wordbook state that belonged to
 * the deleted business shell.
 */
export const usePlayerStore = create<AudioState>((set, get) => ({
  song: null,
  lines: [],
  playInfo: null,
  loadingSong: false,
  queue: [],
  queueIndex: -1,

  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.85,
  audioReady: false,

  seekCheck: null,
  toasts: [],

  beginLoad: (song) =>
    set({
      song,
      loadingSong: true,
      lines: [],
      playInfo: null,
      currentTime: 0,
      duration: song.durationMs / 1000,
      seekCheck: null,
      audioReady: false,
    }),
  finishLoad: (song, lines, playInfo) =>
    set({ song, lines, playInfo, loadingSong: false }),
  setQueue: (queue, queueIndex) => set({ queue, queueIndex }),
  setPlaying: (playing) => set({ playing }),
  setTime: (currentTime, duration) =>
    set((state) => ({
      currentTime,
      duration: duration && Number.isFinite(duration) ? duration : state.duration,
    })),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => {
    set({ volume });
    try {
      localStorage.setItem('orangecy.volume', String(volume));
    } catch {
      // 忽略隐私模式下的存储失败
    }
  },
  setAudioReady: (audioReady) => set({ audioReady }),
  setSeekCheck: (seekCheck) => set({ seekCheck }),
  pushToast: (text, tone = 'info') => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function currentLineIndex(lines: { time: number }[], time: number) {
  if (!lines.length) return -1;
  let low = 0;
  let high = lines.length - 1;
  let found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= time + 0.04) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
