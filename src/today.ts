import { useEffect, useState } from 'react';
import type { FocusCardData } from '@/cards';
import { dayKey, getDueQueue } from '@/lib/srs';
import type { StudyState } from '@/lib/srs';
import { loadWordbook } from '@/lib/wordbook';

export interface BookMeta {
  id: string;
  name: string;
  count: number;
}

/** Same files and counts as public/wordbooks/index.json; display names follow the exam names. */
export const BOOKS: BookMeta[] = [
  { id: 'cet4', name: '大学英语四级', count: 4542 },
  { id: 'cet6', name: '大学英语六级', count: 3991 },
  { id: 'gaozhong', name: '高中英语', count: 3738 },
];

export const BOOK_BY_ID = new Map(BOOKS.map((book) => [book.id, book]));

export function useBookWords(id: string | null) {
  const [loaded, setLoaded] = useState<{ id: string; words: Set<string> } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadWordbook(id)
      .then((book) => {
        if (alive) setLoaded({ id, words: new Set(book.words.map((entry) => entry.w)) });
      })
      .catch((error) => console.warn('[book]', error));
    return () => {
      alive = false;
    };
  }, [id]);
  return loaded && loaded.id === id ? loaded.words : null;
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
  const left = Math.max(0, state.settings.newPerDay - learnedToday);
  return deck.filter((card) => bookWords.has(card.w) && !state.cards[card.w]).slice(0, left);
}

/** M: SRS cards due by the end of today, not yet judged today, that have a playable card. */
export function todayReviewQueue(state: StudyState, deck: FocusCardData[]) {
  const byWord = new Map(deck.map((card) => [card.w, card]));
  return getDueQueue(state, endOfToday())
    .map((item) => byWord.get(item.word))
    .filter((card): card is FocusCardData => Boolean(card));
}

export function learnedInBook(state: StudyState, bookWords: Set<string> | null) {
  if (!bookWords) return 0;
  return Object.keys(state.cards).filter((word) => bookWords.has(word)).length;
}
