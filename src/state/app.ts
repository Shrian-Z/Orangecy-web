import { create } from 'zustand';

export type AppView = 'learn' | 'review' | 'books' | 'me';

const MUTE_KEY = 'orangecy.muted';

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

interface AppState {
  view: AppView;
  muted: boolean;
  setView: (view: AppView) => void;
  toggleMuted: () => void;
}

/**
 * The new shell owns only what the focus card needs: which of the four tabs is
 * active, and whether sound is muted. Everything audio-specific lives in
 * src/audio/store.ts.
 */
export const useAppStore = create<AppState>((set, get) => ({
  view: 'learn',
  muted: readMuted(),
  setView: (view) => set({ view }),
  toggleMuted: () => {
    const muted = !get().muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // 隐私模式下静音只在本次会话生效
    }
    set({ muted });
  },
}));
