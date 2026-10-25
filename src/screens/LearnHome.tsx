import { useMemo } from 'react';
import { BookOpen, CheckCircle2, ChevronRight } from 'lucide-react';
import type { FocusCardData } from '@/cards';
import { useAppStore } from '@/state/app';
import { useStudyStore } from '@/studyStore';
import {
  learnableRemaining,
  learnedInBook,
  todayLearnQueue,
  todayReviewQueue,
  todayStats,
  useBookData,
  useBookList,
} from '@/today';

const EMPTY_DECK: FocusCardData[] = [];
const MORE_BATCH = 10;

export function LearnHome() {
  const state = useStudyStore((store) => store.state);
  const bookId = useAppStore((store) => store.bookId);
  const setPicking = useAppStore((store) => store.setPicking);
  const startSession = useAppStore((store) => store.startSession);
  const books = useBookList();
  const book = bookId ? books.find((item) => item.id === bookId) ?? null : null;
  const data = useBookData(book?.id ?? null);
  const words = data.words;
  const deck = data.deck ?? EMPTY_DECK;
  const learn = useMemo(() => todayLearnQueue(state, deck, words), [state, deck, words]);
  const review = useMemo(() => todayReviewQueue(state, deck), [state, deck]);
  const stats = useMemo(() => todayStats(state, deck), [state, deck]);
  const remaining = useMemo(() => learnableRemaining(state, deck, words), [state, deck, words]);
  const done = Boolean(book) && !data.loading && !learn.length && !review.length;

  const startDaily = () => {
    if (!book) {
      setPicking(true);
      return;
    }
    if (!learn.length) return;
    startSession(
      'learn',
      learn,
      review.length ? { kind: 'review', cards: review } : undefined,
    );
  };

  const startMore = () => {
    if (!book || !remaining) return;
    useStudyStore.getState().increaseTodayNew(MORE_BATCH);
    const next = useStudyStore.getState().state;
    const moreLearn = todayLearnQueue(next, deck, words);
    if (!moreLearn.length) return;
    const moreReview = todayReviewQueue(next, deck);
    startSession(
      'learn',
      moreLearn,
      moreReview.length ? { kind: 'review', cards: moreReview } : undefined,
    );
  };

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

      {done ? (
        <div className="home-done">
          <span className="home-done-icon" aria-hidden="true">
            <CheckCircle2 size={26} strokeWidth={1.6} />
          </span>
          <p className="home-done-title">今日完成</p>
          <p className="home-done-stats">
            {stats.newLearned} 新词 · {stats.reviewed} 复习
          </p>
          {stats.dueLeft > 0 ? (
            <p className="home-done-due">{stats.dueLeft} 个到期，明天继续</p>
          ) : null}
          {remaining > 0 ? (
            <button type="button" className="solid home-done-more" onClick={startMore}>
              再学 {MORE_BATCH} 个
            </button>
          ) : (
            <p className="home-done-all">全部学完</p>
          )}
        </div>
      ) : null}

      {done ? null : (
        <div className="home-actions">
          <button
            type="button"
            className="home-action home-learn"
            disabled={Boolean(book) && !learn.length}
            onClick={startDaily}
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
      )}
    </div>
  );
}
