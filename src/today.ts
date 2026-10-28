import { useEffect, useMemo, useState } from 'react';
import { getFocusDeck } from '@/cards';
import type { FocusCardData } from '@/cards';
import { DEMO, DEMO_BOOK_ID } from '@/demo';
import { buildImportedDeck, isImportedBookId } from '@/lib/importDeck';
import { useImportedBook, useImportedBooks } from '@/lib/importStore';
import { dayKey, getDueQueue } from '@/lib/srs';
import type { StudyState } from '@/lib/srs';
import { loadWordbook } from '@/lib/wordbook';

export interface BookMeta {
  id: string;
  name: string;
  count: number;
}

/** Same files and counts as public/wordbooks/index.json; display names follow the exam names. */
export const BOOKS: BookMeta[] = DEMO
  ? [{ id: DEMO_BOOK_ID, name: '四级 200 词', count: 200 }]
  : [
      { id: 'cet4', name: '大学英语四级', count: 4542 },
      { id: 'cet6', name: '大学英语六级', count: 3991 },
      { id: 'gaozhong', name: '高中英语', count: 3738 },
    ];

export const BOOK_BY_ID = new Map(BOOKS.map((book) => [book.id, book]));

/** Preset shelves plus the user's imported books, newest import first. */
export function useBookList() {
  const imported = useImportedBooks();
  return useMemo(
    () =>
      DEMO
        ? BOOKS
        : [
            ...BOOKS,
            ...imported.map((book) => ({ id: book.id, name: book.name, count: book.count })),
          ],
    [imported],
  );
}

export interface BookData {
  meta: BookMeta | null;
  words: Set<string> | null;
  deck: FocusCardData[] | null;
  loading: boolean;
}

/**
 * One selected book's words and deck. Preset books keep the bundled seed deck
 * filtered by the book; imported books carry matched music cards plus a
 * word-only card for every word no lyric could sing.
 */
export function useBookData(id: string | null): BookData {
  const imported = useImportedBook(id);
  const [preset, setPreset] = useState<{ id: string; words: Set<string> } | null>(null);

  useEffect(() => {
    if (!id || isImportedBookId(id) || (DEMO && id === DEMO_BOOK_ID)) return;
    let alive = true;
    loadWordbook(id)
      .then((book) => {
        if (alive) setPreset({ id, words: new Set(book.words.map((entry) => entry.w)) });
      })
      .catch((error) => console.warn('[book]', error));
    return () => {
      alive = false;
    };
  }, [id]);

  return useMemo(() => {
    if (!id) return { meta: null, words: null, deck: null, loading: false };
    if (DEMO && id === DEMO_BOOK_ID) {
      const deck = getFocusDeck();
      return {
        meta: BOOK_BY_ID.get(id) ?? null,
        words: new Set(deck.map((card) => card.w)),
        deck,
        loading: false,
      };
    }
    if (isImportedBookId(id)) {
      if (!imported) return { meta: null, words: null, deck: null, loading: true };
      return {
        meta: { id, name: imported.name, count: imported.count },
        words: new Set(imported.words.map((entry) => entry.w)),
        deck: buildImportedDeck(imported.words, imported.cards),
        loading: false,
      };
    }
    const meta = BOOK_BY_ID.get(id) ?? null;
    return {
      meta,
      words: preset?.id === id ? preset.words : null,
      deck: meta ? getFocusDeck() : null,
      loading: Boolean(meta) && preset?.id !== id,
    };
  }, [id, imported, preset]);
}

function endOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

/** N: today's remaining new words = min(quota − words first learned today, unseen cards in the book). */
export function todayLearnQueue(state: StudyState, deck: FocusCardData[], bookWords: Set<string> | null) {
  if (!bookWords) return [];
  const today = dayKey();
  const learnedToday = Object.values(state.cards).filter(
    (record) => dayKey(new Date(record.addedAt)) === today,
  ).length;
  const extra = state.daily.date === today ? state.daily.extraNew : 0;
  const left = Math.max(0, state.settings.newPerDay + extra - learnedToday);
  return deck.filter((card) => bookWords.has(card.w) && !state.cards[card.w]).slice(0, left);
}

/** M: due by the end of today, not judged today, capped by the daily review limit (0 = unlimited). */
export function todayReviewQueue(state: StudyState, deck: FocusCardData[]) {
  const byWord = new Map(deck.map((card) => [card.w, card]));
  const due = getDueQueue(state, endOfToday())
    .map((item) => byWord.get(item.word))
    .filter((card): card is FocusCardData => Boolean(card));
  const today = dayKey();
  const reviewedToday = state.daily.date === today ? state.daily.reviewCount : 0;
  const limit = state.settings.reviewPerDay;
  if (!limit) return due;
  return due.slice(0, Math.max(0, limit - reviewedToday));
}

/** Numbers for the completion card; dueLeft counts every playable due card, even those hidden by the limit. */
export function todayStats(state: StudyState, deck: FocusCardData[]) {
  const today = dayKey();
  const newLearned = Object.values(state.cards).filter(
    (record) => dayKey(new Date(record.addedAt)) === today,
  ).length;
  const reviewed = state.daily.date === today ? state.daily.reviewCount : 0;
  const deckWords = new Set(deck.map((card) => card.w));
  const dueLeft = getDueQueue(state, endOfToday()).filter((item) => deckWords.has(item.word)).length;
  return { newLearned, reviewed, dueLeft };
}

/** Unseen cards left in the selected book, regardless of today's quota. */
export function learnableRemaining(
  state: StudyState,
  deck: FocusCardData[],
  bookWords: Set<string> | null,
) {
  if (!bookWords) return 0;
  return deck.filter((card) => bookWords.has(card.w) && !state.cards[card.w]).length;
}

export function learnedInBook(state: StudyState, bookWords: Set<string> | null) {
  if (!bookWords) return 0;
  return Object.keys(state.cards).filter((word) => bookWords.has(word)).length;
}
