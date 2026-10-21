import { create } from 'zustand';
import type { Wordbook, SongMatchIndex } from '@/lib/wordbook';
import type { Song } from '@/types';
import type { Grade3, ReviewOutcome, StudyCardView, StudyState, StudyWord } from '@/lib/srs';
import {
  clampNewPerDay,
  createEmptyStudyState,
  ensureToday,
  getDueQueue,
  getNewQueue,
  getStudyCounts,
  getStudyTargets,
  loadStudyState,
  reviewWord,
  saveStudyState,
  syncStudy,
} from '@/lib/srs';

interface SyncInput {
  wordbook: Wordbook;
  matches: SongMatchIndex;
  song: Song;
}

interface StudyStore {
  state: StudyState;
  ready: boolean;
  counts: { due: number; newWords: number; learned: number };
  lastInput: SyncInput | null;
  init: () => void;
  sync: (input: SyncInput) => void;
  review: (input: {
    word: StudyWord;
    bookId: string;
    rating: Grade3;
    source?: StudyWord['source'];
  }) => ReviewOutcome | null;
  setNewPerDay: (value: number) => void;
  learnQueue: () => StudyCardView[];
  dueQueue: () => StudyCardView[];
  targets: () => string[];
}

export const useStudyStore = create<StudyStore>((set, get) => ({
  state: createEmptyStudyState(),
  ready: false,
  counts: { due: 0, newWords: 0, learned: 0 },
  lastInput: null,

  init: () => {
    const state = ensureToday(loadStudyState());
    saveStudyState(state);
    set({ state, ready: true, counts: getStudyCounts(state) });
  },

  sync: (input) => {
    const current = get().state;
    const state: StudyState = {
      ...current,
      cards: { ...current.cards },
      daily: { ...current.daily, newWords: [...current.daily.newWords], reviewed: [...current.daily.reviewed] },
      logs: [...current.logs],
    };
    syncStudy(state, input);
    saveStudyState(state);
    set({ state, counts: getStudyCounts(state), lastInput: input });
  },

  review: ({ word, bookId, rating, source }) => {
    const current = get().state;
    const state: StudyState = {
      ...current,
      cards: { ...current.cards },
      daily: { ...current.daily, newWords: [...current.daily.newWords], reviewed: [...current.daily.reviewed] },
      logs: [...current.logs],
    };
    const outcome = reviewWord(state, { word, bookId, rating, source });
    saveStudyState(state);
    set({ state, counts: getStudyCounts(state) });
    return outcome;
  },

  setNewPerDay: (value) => {
    const current = get().state;
    const state: StudyState = {
      ...current,
      settings: { ...current.settings, newPerDay: clampNewPerDay(value) },
      daily: { ...current.daily, newWords: [...current.daily.newWords] },
    };
    saveStudyState(state);
    set({ state, counts: getStudyCounts(state) });
    const input = get().lastInput;
    if (input) get().sync(input);
  },

  learnQueue: () => getNewQueue(get().state),
  dueQueue: () => getDueQueue(get().state),
  targets: () => getStudyTargets(get().state),
}));
