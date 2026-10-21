import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Headphones, Volume2, X } from 'lucide-react';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { formatTime } from '@/lib/lrc';
import { splitWordSenses } from '@/lib/wordbook';

export function WordPeek() {
  const focus = usePlayerStore((state) => state.wordFocus);
  const song = usePlayerStore((state) => state.song);
  const setWordFocus = usePlayerStore((state) => state.setWordFocus);
  const toast = usePlayerStore((state) => state.pushToast);

  useEffect(() => {
    if (!focus) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWordFocus(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, setWordFocus]);

  useEffect(() => {
    if (focus && focus.songId !== song?.id) setWordFocus(null);
  }, [focus, song?.id, setWordFocus]);

  const speak = () => {
    if (!focus) return;
    if (!('speechSynthesis' in window)) {
      toast('这台设备不支持朗读', 'error');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(focus.entry.w);
    utterance.lang = 'en-US';
    utterance.rate = 0.88;
    window.speechSynthesis.speak(utterance);
  };

  const example = focus?.entry.s?.split('||') ?? [];

  return (
    <AnimatePresence>
      {focus ? (
        <motion.aside
          className="word-peek world-white"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.985 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          role="dialog"
          aria-label={`单词 ${focus.entry.w}`}
        >
          <header className="word-peek-head">
            <div>
              <p className="word-peek-kicker">WORD IN THIS LINE</p>
              <h3>{focus.entry.w}</h3>
              {focus.entry.p ? <span className="word-phonetic">/{focus.entry.p}/</span> : null}
            </div>
            <div className="word-peek-actions">
              <button type="button" className="icon-button" onClick={speak} aria-label="朗读单词" title="朗读">
                <Volume2 size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setWordFocus(null)}
                aria-label="关闭单词卡"
              >
                <X size={17} />
              </button>
            </div>
          </header>

          <div className="word-senses">
            {splitWordSenses(focus.entry.m).map((sense, index) => (
              <span key={index}>{sense}</span>
            ))}
          </div>

          {focus.entry.syn?.length ? (
            <div className="word-synonyms word-peek-syn">
              <span>近义词</span>
              {focus.entry.syn.map((syn) => (
                <em key={syn}>{syn}</em>
              ))}
            </div>
          ) : null}

          {example[0] ? (
            <div className="word-example">
              <p>{example[0]}</p>
              {example[1] ? <small>{example[1]}</small> : null}
            </div>
          ) : null}

          <div className="word-source">
            <span>
              《{focus.songTitle}》 · {formatTime(focus.time)} · 第 {focus.lineIndex + 1} 句
            </span>
            <p>{focus.lineText}</p>
          </div>

          <footer className="word-peek-foot">
            <button
              type="button"
              className="word-listen"
              onClick={() => {
                void player.seekTo(focus.time, { play: true });
                setWordFocus(null);
              }}
            >
              <Headphones size={15} />
              从这一句听
            </button>
            <button type="button" className="word-dismiss" onClick={() => setWordFocus(null)}>
              收起
            </button>
          </footer>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
