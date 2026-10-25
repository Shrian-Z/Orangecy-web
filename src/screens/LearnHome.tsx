import { useMemo } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { getFocusDeck } from '@/cards';
import { useAppStore } from '@/state/app';
import { useStudyStore } from '@/studyStore';
import {
  BOOK_BY_ID,
  learnedInBook,
  todayLearnQueue,
  todayReviewQueue,
  useBookWords,
} from '@/today';

export function LearnHome() {
  const state = useStudyStore((store) => store.state);
  const bookId = useAppStore((store) => store.bookId);
  const setPicking = useAppStore((store) => store.setPicking);
  const startSession = useAppStore((store) => store.startSession);
  const book = bookId ? BOOK_BY_ID.get(bookId) ?? null : null;
  const words = useBookWords(book?.id ?? null);
  const deck = getFocusDeck();
  const learn = useMemo(() => todayLearnQueue(state, deck, words), [state, deck, words]);
  const review = useMemo(() => todayReviewQueue(state, deck), [state, deck]);

  return (
    <div className="home">
      <button type="button" className="book-bar" onClick={() => setPicking(true)}>
        {book ? (
          <>
            <span className="book-name">{book.name}</span>
            <span className="book-progress">
              {learnedInBook(state, words)} / {book.count}
            </span>
            <span className="book-change">换</span>
          </>
        ) : (
          <>
            <BookOpen size={18} strokeWidth={1.8} aria-hidden="true" />
            <span className="book-name">选择词书</span>
            <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
          </>
        )}
      </button>

      <div className="home-actions">
        <button
          type="button"
          className="home-action home-learn"
          disabled={Boolean(book) && !learn.length}
          onClick={() => (book ? startSession('learn', learn) : setPicking(true))}
        >
          <span>学习</span>
          <b>{learn.length}</b>
        </button>
        <button
          type="button"
          className="home-action home-review"
          disabled={!review.length}
          onClick={() => startSession('review', review)}
        >
          <span>复习</span>
          <b>{review.length}</b>
        </button>
      </div>
    </div>
  );
}
