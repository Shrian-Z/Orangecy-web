import { create } from 'zustand';
import type {
  AuthStatus,
  DrawerKind,
  LyricLine,
  PlayInfo,
  SeekCheck,
  Song,
  Toast,
} from '@/types';
import type { Wordbook, WordbookIndex, WordFocus } from '@/lib/wordbook';

export type AppView = 'player' | 'cards' | 'review' | 'recommend';

interface PlayerState {
  booted: boolean;
  view: AppView;
  auth: AuthStatus | null;
  qqAuth: AuthStatus | null;
  kugouAuth: AuthStatus | null;
  bodianAuth: AuthStatus | null;
  song: Song | null;
  lines: LyricLine[];
  playInfo: PlayInfo | null;
  loadingSong: boolean;
  loadError: string | null;
  queue: Song[];
  queueIndex: number;

  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  audioReady: boolean;

  drawer: DrawerKind;
  reduceMotion: boolean;
  seekCheck: SeekCheck | null;
  toasts: Toast[];

  wordbook: Wordbook | null;
  wordbookIndex: WordbookIndex | null;
  wordbookPrompt: boolean;
  wordFocus: WordFocus | null;

  setBooted: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  setView: (view: AppView) => void;
  setAuth: (value: AuthStatus | null) => void;
  setQQAuth: (value: AuthStatus | null) => void;
  setKugouAuth: (value: AuthStatus | null) => void;
  setBodianAuth: (value: AuthStatus | null) => void;
  beginLoad: (song: Song) => void;
  finishLoad: (song: Song, lines: LyricLine[], playInfo: PlayInfo) => void;
  failLoad: (message: string) => void;
  setQueue: (songs: Song[], index: number) => void;
  setPlaying: (value: boolean) => void;
  setTime: (currentTime: number, duration?: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (value: number) => void;
  setAudioReady: (value: boolean) => void;
  openDrawer: (drawer: DrawerKind) => void;
  setSeekCheck: (check: SeekCheck) => void;
  setWordbookIndex: (index: WordbookIndex | null) => void;
  setWordbook: (book: Wordbook | null) => void;
  setWordbookPrompt: (open: boolean) => void;
  setWordFocus: (focus: WordFocus | null) => void;
  pushToast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const usePlayerStore = create<PlayerState>((set, get) => ({
  booted: false,
  view: 'player',
  auth: null,
  qqAuth: null,
  kugouAuth: null,
  bodianAuth: null,
  song: null,
  lines: [],
  playInfo: null,
  loadingSong: false,
  loadError: null,
  queue: [],
  queueIndex: -1,

  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.85,
  audioReady: false,

  drawer: null,
  reduceMotion: (() => {
    try {
      const stored = localStorage.getItem('orangecy.reduceMotion');
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      // 忽略
    }
    return typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  })(),
  seekCheck: null,
  toasts: [],

  wordbook: null,
  wordbookIndex: null,
  wordbookPrompt: false,
  wordFocus: null,

  setBooted: (booted) => set({ booted }),
  setReduceMotion: (reduceMotion) => {
    try {
      localStorage.setItem('orangecy.reduceMotion', reduceMotion ? '1' : '0');
    } catch {
      // 忽略
    }
    set({ reduceMotion });
  },
  setView: (view) => set({ view, wordFocus: null }),
  setAuth: (auth) => set({ auth }),
  setQQAuth: (qqAuth) => set({ qqAuth }),
  setKugouAuth: (kugouAuth) => set({ kugouAuth }),
  setBodianAuth: (bodianAuth) => set({ bodianAuth }),
  beginLoad: (song) =>
    set({
      song,
      loadingSong: true,
      loadError: null,
      lines: [],
      playInfo: null,
      currentTime: 0,
      duration: song.durationMs / 1000,
      seekCheck: null,
    }),
  finishLoad: (song, lines, playInfo) =>
    set({ song, lines, playInfo, loadingSong: false, loadError: null }),
  failLoad: (message) => set({ loadingSong: false, loadError: message }),
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
  openDrawer: (drawer) => set({ drawer }),
  setSeekCheck: (seekCheck) => set({ seekCheck }),
  setWordbookIndex: (wordbookIndex) => set({ wordbookIndex }),
  setWordbook: (wordbook) => set({ wordbook, wordFocus: null }),
  setWordbookPrompt: (wordbookPrompt) => set({ wordbookPrompt }),
  setWordFocus: (wordFocus) => set({ wordFocus }),
  pushToast: (text, tone = 'info') => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function currentLineIndex(lines: LyricLine[], time: number) {
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
