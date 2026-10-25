import { create } from 'zustand';
import type { FocusCardData } from '@/cards';

export type AppView = 'learn' | 'playlists' | 'me';
export type SessionKind = 'learn' | 'review';

export interface SessionPlan {
  kind: SessionKind;
  cards: FocusCardData[];
}

export interface LearnSession extends SessionPlan {
  id: number;
  /** Due review queue that starts as soon as the new-word queue finishes. */
  next?: SessionPlan;
}

let sessionSeq = 0;

const MUTE_KEY = 'orangecy.muted';
const BOOK_KEY = 'orangecy.book';

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function readBook() {
  try {
    return localStorage.getItem(BOOK_KEY);
  } catch {
    return null;
  }
}

interface AppState {
  view: AppView;
  muted: boolean;
  bookId: string | null;
  picking: boolean;
  session: LearnSession | null;
  setView: (view: AppView) => void;
  toggleMuted: () => void;
  setBook: (id: string) => void;
  setPicking: (picking: boolean) => void;
  startSession: (kind: SessionKind, cards: FocusCardData[], next?: SessionPlan) => void;
  advanceSession: () => void;
  endSession: () => void;
}

/**
 * Shell state: which of the three tabs is active, mute, the chosen wordbook and
 * the running learn/review queue. The queue is frozen when a button is pressed
 * so judging cards never reshuffles it. Audio state lives in src/audio/store.ts.
 */
export const useAppStore = create<AppState>((set, get) => ({
  view: 'learn',
  muted: readMuted(),
  bookId: readBook(),
  picking: false,
  session: null,
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
  setBook: (bookId) => {
    try {
      localStorage.setItem(BOOK_KEY, bookId);
    } catch {
      // 隐私模式下词书只在本次会话生效
    }
    set({ bookId });
  },
  setPicking: (picking) => set({ picking }),
  startSession: (kind, cards, next) =>
    set({
      session: cards.length ? { id: (sessionSeq += 1), kind, cards, next } : null,
    }),
  advanceSession: () => {
    const current = get().session;
    if (!current?.next) {
      set({ session: null });
      return;
    }
    set({ session: { id: (sessionSeq += 1), ...current.next } });
  },
  endSession: () => set({ session: null }),
}));
