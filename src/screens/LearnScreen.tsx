import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { FocusCard } from '@/components/FocusCard';
import { MuteButton } from '@/components/MuteButton';
import { FocusSequence } from '@/audio/sequence';
import type { FocusSnapshot } from '@/audio/sequence';
import { usePlayerStore } from '@/audio/store';
import { DEMO } from '@/demo';
import { useAppStore } from '@/state/app';
import type { SessionKind } from '@/state/app';
import { useStudyStore } from '@/studyStore';
import { cardToStudyWord, sourceFromCard } from '@/cards';
import type { FocusCardData } from '@/cards';
import { useBookData } from '@/today';
import {
  buildQuiz,
  createLearnSession,
  distractorSource,
  fromOrangecyWord,
} from '@/lib/study';
import type { CardView as QueueCard, LearnSession as QueueSession, Quiz } from '@/lib/study';

const INITIAL: FocusSnapshot = {
  phase: 'idle',
  progress: 0,
  activeLine: -1,
  songTime: 0,
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function LearnScreen({
  active,
  cards: deck,
  kind,
  bookId,
  onBack,
  onComplete,
}: {
  active: boolean;
  cards: FocusCardData[];
  kind: SessionKind;
  bookId: string;
  onBack: () => void;
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<FocusSnapshot>(INITIAL);
  const [picked, setPicked] = useState<number | null>(null);
  const [queue, setQueue] = useState<{
    session: QueueSession;
    card: QueueCard | null;
  } | null>(() => {
    if (kind !== 'learn') return null;
    const entries = deck.map((item) => fromOrangecyWord(item));
    const session = createLearnSession(entries, undefined, {
      groupSize: Math.max(10, deck.length),
      groupLayer: 4,
      level1Count: 3,
      level2Count: 3,
      level3Count: 4,
      level4Count: 5,
      optionCount: 4,
      shuffleNewWords: false,
    });
    return { session, card: session.next() };
  });
  const reviewedRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const sequenceRef = useRef<FocusSequence | null>(null);
  const quizTimerRef = useRef<number | null>(null);
  const muted = useAppStore((state) => state.muted);
  const toggleMuted = useAppStore((state) => state.toggleMuted);
  const reduceMotion = useReducedMotion();
  const queueMode = kind === 'learn';
  const queueCard = queue?.card ?? null;
  const card = queueMode
    ? queueCard
      ? deck.find((item) => item.w === queueCard.entry.word) ?? null
      : null
    : deck[index] ?? null;
  const total = queueMode ? queue?.session.state().total ?? deck.length : deck.length;
  const displayIndex = queueMode
    ? queue?.session.state().finished ?? 0
    : index + 1;
  const studyRecord = useStudyStore((state) => (card ? state.state.cards[card.w] : undefined));
  const variant: 'context' | 'recall' | 'cloze' | undefined = DEMO
    ? studyRecord && studyRecord.card.reps >= 2
      ? 'cloze'
      : displayIndex % 3 === 1
        ? 'recall'
        : displayIndex % 3 === 2
          ? 'cloze'
          : 'context'
    : !card
      ? undefined
      : card.fragment
        ? undefined
        : !card.s
          ? 'recall'
          : !studyRecord
            ? 'context'
            : studyRecord.card.reps >= 2 || studyRecord.card.lapses >= 2
              ? 'cloze'
              : 'recall';

  useEffect(() => {
    const sequence = new FocusSequence(setSnapshot);
    sequenceRef.current = sequence;
    return () => {
      sequenceRef.current = null;
      void sequence.dispose();
    };
  }, []);

  useEffect(() => {
    sequenceRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    const sequence = sequenceRef.current;
    if (!sequence) return;
    if (!active || !card) {
      void sequence.stop({ fadeOut: true });
      return;
    }
    void sequence.start(card);
  }, [active, card, index, attempt]);

  useEffect(() => {
    setExpanded(false);
    setPicked(null);
  }, [card?.w, index, attempt]);

  const bookData = useBookData(bookId || null);
  const distractorDeck = distractorSource(bookData.deck, deck);
  const quiz = useMemo<Quiz | null>(() => {
    if (kind !== 'learn' || !card) return null;
    const correct = fromOrangecyWord(card);
    const pool = distractorDeck
      .filter((item) => item.w.toLowerCase() !== card.w.toLowerCase())
      .map((item) => fromOrangecyWord(item));
    const nextQuiz = buildQuiz(correct, pool, 4, Math.random);
    return nextQuiz && nextQuiz.options.length >= 2 ? nextQuiz : null;
  }, [card, distractorDeck, kind]);

  useEffect(() => {
    return () => {
      if (quizTimerRef.current !== null) {
        window.clearTimeout(quizTimerRef.current);
        quizTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const unlock = () => sequenceRef.current?.resumeAfterGesture();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, [active]);

  useEffect(() => {
    let lastToast = 0;
    return usePlayerStore.subscribe((state) => {
      const toast = state.toasts[state.toasts.length - 1];
      if (!toast || toast.id === lastToast) return;
      lastToast = toast.id;
      // 零文字：错误只进 console，不弹 toast
      console.warn('[audio]', toast.text);
    });
  }, []);

  const toggleExpanded = useCallback(() => {
    if (busyRef.current || quiz) return;
    setExpanded((value) => !value);
  }, [quiz]);

  const replayFragment = useCallback(() => {
    if (busyRef.current) return;
    void sequenceRef.current?.replayFragment();
  }, []);

  const speakWord = useCallback(() => {
    if (busyRef.current) return;
    void sequenceRef.current?.speakWord();
  }, []);

  const rate = useCallback(
    async (rating: 'again' | 'hard' | 'good') => {
      if (!card || busyRef.current) return;

      busyRef.current = true;
      setBusy(true);
      setPicked(null);

      const firstAnswer = !reviewedRef.current.has(card.w);
      if (!queueMode || firstAnswer) {
        if (queueMode) reviewedRef.current.add(card.w);
        useStudyStore.getState().review({
          word: cardToStudyWord(card),
          bookId,
          rating,
          source: sourceFromCard(card),
          kind,
        });
      }

      await sequenceRef.current?.stop({ fadeOut: true });
      busyRef.current = false;
      setBusy(false);

      if (queueMode && queue) {
        const action =
          rating === 'good' ? 'know' : rating === 'hard' ? 'vague' : 'dontKnow';
        queue.session.answer(action);
        const next = queue.session.next();
        setQueue({ session: queue.session, card: next });
        setAttempt((value) => value + 1);
        if (!next) onComplete();
        return;
      }

      if (rating === 'again') {
        // Same-session repair: keep the card, restart its sequence, let the
        // learner try again before moving on.
        setAttempt((value) => value + 1);
        return;
      }
      if (index + 1 >= deck.length) onComplete();
      else setIndex(index + 1);
    },
    [bookId, card, deck, index, kind, onComplete, queue, queueMode],
  );

  const pickQuiz = useCallback(
    (choice: number) => {
      const activeQuiz = quiz;
      if (!activeQuiz || picked !== null) return;
      setPicked(choice);
      const correct = choice === activeQuiz.correctIndex;
      if (quizTimerRef.current !== null) window.clearTimeout(quizTimerRef.current);
      quizTimerRef.current = window.setTimeout(() => {
        quizTimerRef.current = null;
        void rate(correct ? 'good' : 'again');
      }, 680);
    },
    [picked, quiz, rate],
  );

  return (
    <div className="study">
      <header className="status">
        <span className="status-lead">
          <button type="button" className="icon-action status-back" onClick={onBack} aria-label="返回">
            <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <span className="counter">
            <b>{pad2(displayIndex)}</b>
            <i>/</i>
            {pad2(total)}
          </span>
        </span>
        <MuteButton muted={muted} onToggle={toggleMuted} />
      </header>

      {card ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${queueMode ? queueCard?.entry.word ?? 'queue' : index}-${attempt}`}
            className="focus-card-slot"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -16 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <FocusCard
              card={card}
              expanded={expanded}
              phase={snapshot.phase}
              progress={snapshot.progress}
              activeLine={snapshot.activeLine}
              muted={muted}
              busy={busy}
              demo={DEMO}
              variant={variant}
              actionsAlwaysVisible={kind === 'review'}
              showActions={kind === 'review' || !quiz}
              hideMeaning={Boolean(quiz)}
              quiz={
                quiz
                  ? {
                      options: quiz.options.map((option) => ({
                        pos: option.pos,
                        meaning: option.meaning,
                      })),
                      correctIndex: quiz.correctIndex,
                      picked,
                      onPick: pickQuiz,
                    }
                  : undefined
              }
              onToggle={toggleExpanded}
              onReplay={replayFragment}
              onSpeak={speakWord}
              onRate={rate}
            />
          </motion.div>
        </AnimatePresence>
      ) : null}
    </div>
  );
}
