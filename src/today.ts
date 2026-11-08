import { useEffect, useMemo, useState } from 'react';
import { getFocusDeck } from '@/cards';
import type { FocusCardData } from '@/cards';
import { DEMO, DEMO_BOOK_ID } from '@/demo';
import {
  buildImportedDeck,
  findExampleSurface,
  isImportedBookId,
  plainCardFor,
} from '@/lib/importDeck';
import { useImportedBook, useImportedBooks } from '@/lib/importStore';
import { getDueQueue } from '@/lib/srs';
import type { StudyState } from '@/lib/srs';
import { loadWordbook } from '@/lib/wordbook';
import { quotaForBook, reviewQuota } from '@/lib/everyday';
import {
  extraNewToday,
  learnedNewToday,
  orangecyStudyDay,
  unseenCards,
} from '@/lib/everydayPlan';
import type { Wordbook } from '@/lib/wordbook';

export interface BookMeta {
  id: string;
  name: string;
  count: number;
}

/** Same files and counts as public/wordbooks/index.json; display names follow the exam names. */
export const BOOKS: BookMeta[] = DEMO
  ? [{ id: DEMO_BOOK_ID, name: '四级 200 词', count: 200 }]
  : [
      { id: 'cet4', name: '大学英语四级', count: 3864 },
      { id: 'cet6', name: '大学英语六级', count: 5308 },
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
 * A preset book must be fully learnable, not just the bundled 50-word slice:
 * every wordbook entry gets a card, and the bundled music card is overlaid on
 * words that already have a real lyric fragment. Music cards alternate with
 * hard word-only cards, so a session has both context and less-common words.
 */
export function buildPresetDeck(book: Wordbook): FocusCardData[] {
  const dict = new Map(book.words.map((entry) => [entry.w.toLowerCase(), entry]));
  const music = new Map(getFocusDeck().map((card) => [card.w.toLowerCase(), card]));
  const cards = book.words.map((entry) => {
    const hit = music.get(entry.w.toLowerCase());
    if (!hit) return plainCardFor(entry, dict);
    const exampleSurface = hit.exampleSurface ?? findExampleSurface(hit.s, entry, dict);
    return exampleSurface ? { ...hit, exampleSurface } : hit;
  });
  const musicCards = cards.filter((card) => Boolean(card.fragment));
  const plainCards = cards.filter((card) => !card.fragment);
  const hard = plainCards
    .filter((card) => card.w.length >= 7)
    .sort((left, right) => (right.rank ?? 0) - (left.rank ?? 0));
  const soft = plainCards
    .filter((card) => card.w.length < 7)
    .sort((left, right) => (right.rank ?? 0) - (left.rank ?? 0));
  const rest = [...hard, ...soft];
  const mixed: FocusCardData[] = [];
  for (let index = 0; index < Math.max(musicCards.length, rest.length); index += 1) {
    if (musicCards[index]) mixed.push(musicCards[index]);
    if (rest[index]) mixed.push(rest[index]);
  }
  return mixed;
}

/**
 * One selected book's words and deck. Preset books build a full deck from the
 * wordbook (music cards overlay where available); imported books carry matched
 * music cards plus a word-only card for every word no lyric could sing.
 */
export function useBookData(id: string | null): BookData {
  const imported = useImportedBook(id);
  const [preset, setPreset] = useState<{
    id: string;
    words: Set<string>;
    deck: FocusCardData[];
  } | null>(null);

  useEffect(() => {
    if (!id || isImportedBookId(id) || (DEMO && id === DEMO_BOOK_ID)) return;
    let alive = true;
    loadWordbook(id)
      .then((book) => {
        if (alive) {
          setPreset({
            id,
            words: new Set(book.words.map((entry) => entry.w.toLowerCase())),
            deck: buildPresetDeck(book),
          });
        }
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
        words: new Set(deck.map((card) => card.w.toLowerCase())),
        deck,
        loading: false,
      };
    }
    if (isImportedBookId(id)) {
      if (!imported) return { meta: null, words: null, deck: null, loading: true };
      return {
        meta: { id, name: imported.name, count: imported.count },
        words: new Set(imported.words.map((entry) => entry.w.toLowerCase())),
        deck: buildImportedDeck(imported.words, imported.cards),
        loading: false,
      };
    }
    const meta = BOOK_BY_ID.get(id) ?? null;
    return {
      meta,
      words: preset?.id === id ? preset.words : null,
      deck: preset?.id === id ? preset.deck : null,
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
  const learnedToday = learnedNewToday(state);
  const extra = extraNewToday(state);
  const unseen = unseenCards(state, deck, bookWords);
  const quota = quotaForBook(state.settings.newPerDay + extra, learnedToday, unseen.length);
  return unseen.slice(0, quota);
}

/** M: due by the end of today, not judged today, capped by the daily review limit (0 = unlimited). */
export function todayReviewQueue(state: StudyState, deck: FocusCardData[]) {
  const byWord = new Map(deck.map((card) => [card.w.toLowerCase(), card]));
  const due = getDueQueue(state, endOfToday())
    .map((item) => byWord.get(item.word.toLowerCase()))
    .filter((card): card is FocusCardData => Boolean(card));
  const reviewedToday =
    state.daily.date === orangecyStudyDay() ? state.daily.reviewCount : 0;
  return due.slice(0, reviewQuota(due.length, state.settings.reviewPerDay, reviewedToday));
}

/** Numbers for the completion card; dueLeft counts every playable due card, even those hidden by the limit. */
export function todayStats(state: StudyState, deck: FocusCardData[]) {
  const today = orangecyStudyDay();
  const newLearned = learnedNewToday(state);
  const reviewed = state.daily.date === today ? state.daily.reviewCount : 0;
  const deckWords = new Set(deck.map((card) => card.w.toLowerCase()));
  const dueLeft = getDueQueue(state, endOfToday()).filter((item) =>
    deckWords.has(item.word.toLowerCase()),
  ).length;
  return { newLearned, reviewed, dueLeft };
}

/** Unseen cards left in the selected book, regardless of today's quota. */
export function learnableRemaining(
  state: StudyState,
  deck: FocusCardData[],
  bookWords: Set<string> | null,
) {
  return unseenCards(state, deck, bookWords).length;
}

/**
 * Words in this book that already have an SRS record, regardless of which book
 * taught them. Books share one memory per word; "已学" is "known in this book",
 * not "newly learned from this book".
 */
export function learnedInBook(state: StudyState, bookWords: Set<string> | null) {
  if (!bookWords) return 0;
  return Object.keys(state.cards).filter((word) => bookWords.has(word.toLowerCase())).length;
}

export { todayPlanSnapshot } from '@/lib/everydayPlan';
