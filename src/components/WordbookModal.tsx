import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Check, Loader2, X } from 'lucide-react';
import { loadWordbook, loadWordbookIndex } from '@/lib/wordbook';
import { usePlayerStore } from '@/store';
import { useStudyStore } from '@/studyStore';

const SAMPLES: Record<string, string[]> = {
  cet4: ['abandon', 'benefit', 'capture'],
  cet6: ['abrupt', 'coherent', 'deteriorate'],
  gaozhong: ['achieve', 'curious', 'journey'],
};

export function WordbookModal() {
  const open = usePlayerStore((state) => state.wordbookPrompt);
  const index = usePlayerStore((state) => state.wordbookIndex);
  const current = usePlayerStore((state) => state.wordbook);
  const study = useStudyStore((state) => state.state);
  const learnedByBook = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const record of Object.values(study.cards)) {
      counts[record.bookId] = (counts[record.bookId] ?? 0) + 1;
    }
    return counts;
  }, [study.cards]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || index) return;
    let cancelled = false;
    loadWordbookIndex()
      .then((data) => {
        if (!cancelled) usePlayerStore.getState().setWordbookIndex(data);
      })
      .catch(() => {
        if (!cancelled) setError('词书索引没加载出来，检查一下网络');
      });
    return () => {
      cancelled = true;
    };
  }, [open, index]);

  const choose = async (id: string, name: string) => {
    if (loadingId) return;
    setLoadingId(id);
    setError(null);
    try {
      const book = await loadWordbook(id);
      usePlayerStore.getState().setWordbook(book);
      try {
        localStorage.setItem('orangecy.wordbook', id);
      } catch {
        // 隐私模式存不了，本次会话仍然有效
      }
      usePlayerStore.getState().setWordbookPrompt(false);
      usePlayerStore.getState().pushToast(`词书已就位：${name} · ${book.count} 词`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '这本词书没有加载出来');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (current) usePlayerStore.getState().setWordbookPrompt(false);
            }}
          />
          <div className="modal-layer">
            <motion.div
              className="wordbook-modal"
              initial={{ opacity: 0, y: 20, scale: 0.975 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              role="dialog"
              aria-modal="true"
              aria-label="选择词书"
            >
              {current ? (
                <button
                  type="button"
                  className="modal-close icon-button"
                  onClick={() => usePlayerStore.getState().setWordbookPrompt(false)}
                  aria-label="关闭"
                >
                  <X size={17} />
                </button>
              ) : null}

              <header className="wordbook-head">
                <p className="drawer-kicker">YOUR WORDS</p>
                <h2>{current ? '换一本词书' : '先选一本词书'}</h2>
                <p>
                  歌里出现的词，会从这本词书里亮起来。选一次就记住，之后随时能换。
                </p>
              </header>

              <div className="wordbook-grid" role="list">
                {index?.books.map((book) => {
                  const active = current?.id === book.id;
                  const busy = loadingId === book.id;
                  const learned = learnedByBook[book.id] ?? 0;
                  const percent = Math.min(100, (learned / Math.max(1, book.count)) * 100);
                  return (
                    <button
                      type="button"
                      role="listitem"
                      key={book.id}
                      className={`wordbook-card ${active ? 'is-current' : ''}`}
                      onClick={() => void choose(book.id, book.name)}
                      disabled={Boolean(loadingId)}
                    >
                      <span className="wordbook-card-top">
                        <span className="wordbook-icon">
                          <BookOpen size={17} strokeWidth={1.7} />
                        </span>
                        <span className="wordbook-count">{book.count.toLocaleString('en-US')} 词</span>
                        {active ? (
                          <span className="wordbook-check">
                            <Check size={13} />
                            当前
                          </span>
                        ) : busy ? (
                          <Loader2 className="spin" size={15} />
                        ) : null}
                      </span>
                      <strong>{book.name}</strong>
                      <small>{book.tagline}</small>
                      <span className="wordbook-progress">
                        <span className="wordbook-progress-bar">
                          <i style={{ width: `${learned > 0 ? Math.max(1.5, percent) : 0}%` }} />
                        </span>
                        <em>{learned} / {book.count.toLocaleString('en-US')} 已学</em>
                      </span>
                      <span className="wordbook-samples">
                        {(SAMPLES[book.id] ?? []).map((word) => (
                          <em key={word}>{word}</em>
                        ))}
                      </span>
                      <span className="wordbook-cta">{active ? '正在使用' : '选这本'} →</span>
                    </button>
                  );
                })}

                {!index
                  ? [0, 1, 2].map((item) => (
                      <div className="wordbook-card is-skeleton" key={item}>
                        <span className="skeleton-lines">
                          <i style={{ width: '48%' }} />
                          <i style={{ width: '72%' }} />
                          <i style={{ width: '58%' }} />
                        </span>
                      </div>
                    ))
                  : null}
              </div>

              {error ? <p className="wordbook-error">{error}</p> : null}

              <footer className="wordbook-foot">
                <span>
                  词库来源 KyleBing/english-vocabulary · BSD-3-Clause · 只存本机
                </span>
                <em>释义不在云端，换设备会重新选</em>
              </footer>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
