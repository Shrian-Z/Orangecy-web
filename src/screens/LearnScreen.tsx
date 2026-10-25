import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { FocusCard } from '@/components/FocusCard';
import { MuteButton } from '@/components/MuteButton';
import { FocusSequence } from '@/audio/sequence';
import type { FocusSnapshot } from '@/audio/sequence';
import { usePlayerStore } from '@/audio/store';
import { useAppStore } from '@/state/app';
import { useStudyStore } from '@/studyStore';
import { cardToStudyWord, sourceFromCard } from '@/cards';
import type { FocusCardData } from '@/cards';

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
  bookId,
  onExit,
}: {
  active: boolean;
  cards: FocusCardData[];
  bookId: string;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<FocusSnapshot>(INITIAL);
  const busyRef = useRef(false);
  const sequenceRef = useRef<FocusSequence | null>(null);
  const muted = useAppStore((state) => state.muted);
  const toggleMuted = useAppStore((state) => state.toggleMuted);
  const reduceMotion = useReducedMotion();
  const card = deck[index] ?? null;

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
  }, [active, card, index]);

  useEffect(() => {
    setExpanded(false);
  }, [index]);

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
    if (busyRef.current) return;
    setExpanded((value) => !value);
  }, []);

  const replayFragment = useCallback(() => {
    if (busyRef.current) return;
    void sequenceRef.current?.replayFragment();
  }, []);

  const speakWord = useCallback(() => {
    if (busyRef.current) return;
    void sequenceRef.current?.speakWord();
  }, []);

  const rate = useCallback(
    async (rating: 'hard' | 'good') => {
      if (!card || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      useStudyStore.getState().review({
        word: cardToStudyWord(card),
        bookId,
        rating,
        source: sourceFromCard(card),
      });
      await sequenceRef.current?.stop({ fadeOut: true });
      busyRef.current = false;
      setBusy(false);
      if (index + 1 >= deck.length) onExit();
      else setIndex(index + 1);
    },
    [bookId, card, deck.length, index, onExit],
  );

  return (
    <div className="study">
      <header className="status">
        <span className="status-lead">
          <button type="button" className="icon-action status-back" onClick={onExit} aria-label="返回">
            <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <span className="counter">
            <b>{pad2(index + 1)}</b>
            <i>/</i>
            {pad2(deck.length)}
          </span>
        </span>
        <MuteButton muted={muted} onToggle={toggleMuted} />
      </header>

      {card ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
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
