import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card } from 'ts-fsrs';
import type { SongMatchIndex, Wordbook, WordbookWord } from '@/lib/wordbook';
import { isStopword } from '@/lib/wordbook';
import type { Song } from '@/types';

export type Grade3 = 'again' | 'hard' | 'good';

export interface StudySource {
  songId: string;
  songTitle: string;
  time: number;
  lineText: string;
  song?: Song;
}

export interface StudyWord {
  word: string;
  entry: WordbookWord;
  source?: StudySource;
}

export interface StoredFsrsCard extends Omit<Card, 'due' | 'last_review'> {
  due: string;
  last_review?: string;
}

export interface StudyRecord {
  word: string;
  bookId: string;
  entry: WordbookWord;
  card: StoredFsrsCard;
  source?: StudySource;
  addedAt: string;
  lastReviewedAt?: string;
}

export interface StudyLog {
  word: string;
  rating: Grade3;
  at: string;
  due: string;
  scheduledDays: number;
}

export interface DailyStudy {
  date: string;
  bookId: string;
  newWords: StudyWord[];
  reviewed: string[];
}

export interface StudyState {
  version: 1;
  cards: Record<string, StudyRecord>;
  daily: DailyStudy;
  settings: {
    newPerDay: number;
  };
  logs: StudyLog[];
}

export interface StudyCardView extends StudyWord {
  status: 'new' | 'due';
  due?: Date;
}

export interface ReviewOutcome {
  due: Date;
  intervalDays: number;
  isNew: boolean;
}

const STORAGE_KEY = 'orangecy.study.v1';
const DEFAULT_NEW_PER_DAY = 10;
const MAX_LOGS = 1200;

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_short_term: false,
  learning_steps: [],
  relearning_steps: [],
});

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emptyDaily(today = dayKey()): DailyStudy {
  return { date: today, bookId: '', newWords: [], reviewed: [] };
}

export function createEmptyStudyState(): StudyState {
  return {
    version: 1,
    cards: {},
    daily: emptyDaily(),
    settings: { newPerDay: DEFAULT_NEW_PER_DAY },
    logs: [],
  };
}

function encodeCard(card: Card): StoredFsrsCard {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString(),
  };
}

function decodeCard(card: StoredFsrsCard): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

function normalizeState(raw: unknown): StudyState {
  const base = createEmptyStudyState();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<StudyState>;
  return {
    version: 1,
    cards: input.cards && typeof input.cards === 'object' ? input.cards : {},
    daily: {
      ...base.daily,
      ...(input.daily ?? {}),
      newWords: Array.isArray(input.daily?.newWords) ? input.daily.newWords : [],
      reviewed: Array.isArray(input.daily?.reviewed) ? input.daily.reviewed : [],
    },
    settings: {
      newPerDay: clampNewPerDay(Number(input.settings?.newPerDay ?? DEFAULT_NEW_PER_DAY)),
    },
    logs: Array.isArray(input.logs) ? input.logs.slice(-MAX_LOGS) : [],
  };
}

export function clampNewPerDay(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_NEW_PER_DAY;
  return Math.max(5, Math.min(30, Math.round(value)));
}

export function loadStudyState(): StudyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeState(raw ? JSON.parse(raw) : null);
  } catch {
    return createEmptyStudyState();
  }
}

export function saveStudyState(state: StudyState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或空间不足时不影响本次会话
  }
}

export function ensureToday(state: StudyState, now = new Date()) {
  const today = dayKey(now);
  if (state.daily.date !== today) {
    state.daily = {
      date: today,
      bookId: state.daily.bookId,
      newWords: [],
      reviewed: [],
    };
  }
  return state;
}

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

export function syncStudy(
  state: StudyState,
  input: { wordbook: Wordbook; matches: SongMatchIndex; song: Song },
  now = new Date(),
) {
  ensureToday(state, now);

  if (state.daily.bookId !== input.wordbook.id) {
    state.daily.bookId = input.wordbook.id;
    state.daily.newWords = [];
  }

  const limit = state.settings.newPerDay;
  if (state.daily.newWords.length >= limit) return state;

  const reviewed = new Set(state.daily.reviewed);
  const queued = new Set(state.daily.newWords.map((item) => item.word));
  const push = (item: StudyWord) => {
    if (state.daily.newWords.length >= limit) return;
    if (state.cards[item.word] || queued.has(item.word) || reviewed.has(item.word)) return;
    if (isStopword(item.word)) return;
    state.daily.newWords.push(item);
    queued.add(item.word);
  };

  for (const item of input.matches.words.values()) {
    if (state.daily.newWords.length >= limit) break;
    push({
      word: item.entry.w,
      entry: item.entry,
      source: {
        songId: input.song.id,
        songTitle: input.song.title,
        time: item.time,
        lineText: item.lineText,
        song: input.song,
      },
    });
  }

  if (state.daily.newWords.length < limit) {
    const start = dayOfYear(now) % Math.max(1, input.wordbook.words.length);
    for (let i = 0; i < input.wordbook.words.length && state.daily.newWords.length < limit; i += 1) {
      const entry = input.wordbook.words[(start + i) % input.wordbook.words.length];
      push({ word: entry.w, entry });
    }
  }

  return state;
}

export function reviewWord(
  state: StudyState,
  input: {
    word: StudyWord;
    bookId: string;
    rating: Grade3;
    source?: StudySource;
    now?: Date;
  },
): ReviewOutcome {
  const now = input.now ?? new Date();
  ensureToday(state, now);
  const grade =
    input.rating === 'again' ? Rating.Again : input.rating === 'hard' ? Rating.Hard : Rating.Good;

  const existing = state.cards[input.word.word];
  const isNew = !existing;
  const card = existing ? decodeCard(existing.card) : createEmptyCard(now);
  const next = scheduler.next(card, now, grade);

  state.cards[input.word.word] = {
    word: input.word.word,
    bookId: existing?.bookId ?? input.bookId,
    entry: existing?.entry ?? input.word.entry,
    card: encodeCard(next.card),
    source: input.source ?? existing?.source ?? input.word.source,
    addedAt: existing?.addedAt ?? now.toISOString(),
    lastReviewedAt: now.toISOString(),
  };

  if (!state.daily.reviewed.includes(input.word.word)) {
    state.daily.reviewed.push(input.word.word);
  }

  state.logs.push({
    word: input.word.word,
    rating: input.rating,
    at: now.toISOString(),
    due: next.card.due.toISOString(),
    scheduledDays: next.card.scheduled_days,
  });
  if (state.logs.length > MAX_LOGS) state.logs = state.logs.slice(-MAX_LOGS);

  return {
    due: next.card.due,
    intervalDays: Math.max(1, Math.round(next.card.scheduled_days)),
    isNew,
  };
}

function isReviewedToday(state: StudyState, word: string) {
  return state.daily.date === dayKey() && state.daily.reviewed.includes(word);
}

export function getNewQueue(state: StudyState): StudyCardView[] {
  return state.daily.newWords
    .filter((item) => !isReviewedToday(state, item.word))
    .map((item) => ({ ...item, status: 'new' as const }));
}

export function getDueQueue(state: StudyState, now = new Date()): StudyCardView[] {
  return Object.values(state.cards)
    .filter((record) => {
      const due = new Date(record.card.due);
      if (due.getTime() > now.getTime()) return false;
      return !isReviewedToday(state, record.word);
    })
    .sort((a, b) => new Date(a.card.due).getTime() - new Date(b.card.due).getTime())
    .map((record) => ({
      word: record.word,
      entry: record.entry,
      source: record.source,
      status: 'due' as const,
      due: new Date(record.card.due),
    }));
}

export function getStudyCounts(state: StudyState, now = new Date()) {
  return {
    due: getDueQueue(state, now).length,
    newWords: getNewQueue(state).length,
    learned: Object.keys(state.cards).length,
  };
}

export function getStudyTargets(state: StudyState, now = new Date()) {
  const due = getDueQueue(state, now).map((item) => item.word);
  const fresh = getNewQueue(state).map((item) => item.word);
  return [...new Set([...due, ...fresh])];
}

export function previewIntervals(
  state: StudyState,
  word: string,
  now = new Date(),
) {
  const record = state.cards[word];
  const card = record ? decodeCard(record.card) : createEmptyCard(now);
  const preview = scheduler.repeat(card, now);
  return {
    again: preview[Rating.Again].card.scheduled_days,
    hard: preview[Rating.Hard].card.scheduled_days,
    good: preview[Rating.Good].card.scheduled_days,
  };
}

export function getDueLabel(due: Date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days <= 1) return '明天';
  if (days < 7) return `${days} 天后`;
  return `${due.getMonth() + 1} 月 ${due.getDate()} 日`;
}

export function getStateLabel(record: StudyRecord) {
  return State[record.card.state as State] ?? 'Review';
}
