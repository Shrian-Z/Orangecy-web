import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Headphones,
  Minus,
  Play,
  RotateCcw,
  Volume2,
  X,
} from 'lucide-react';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { useStudyStore } from '@/studyStore';
import { formatTime } from '@/lib/lrc';
import { lookupWord, splitWordSenses } from '@/lib/wordbook';
import type { WordbookWord } from '@/lib/wordbook';
import type { Grade3, StudyCardView } from '@/lib/srs';
import { getDueLabel, previewIntervals } from '@/lib/srs';

type Stats = Record<Grade3, number>;

const EMPTY_STATS: Stats = { again: 0, hard: 0, good: 0 };
const AUTOPLAY_KEY = 'orangecy.cardsAutoplay';
const AUTOSPEAK_KEY = 'orangecy.cardsSpeak';

function speak(word: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.86;
  window.speechSynthesis.speak(utterance);
}

function shortMeaning(meaning: string) {
  const first = splitWordSenses(meaning)[0] ?? '';
  return first.replace(/^[a-zA-Z.]+\\s*/, '').slice(0, 10);
}

function GradeIcon({ rating }: { rating: Grade3 }) {
  if (rating === 'again') return <X size={14} strokeWidth={2} aria-hidden="true" />;
  if (rating === 'hard') return <Minus size={14} strokeWidth={2} aria-hidden="true" />;
  return <Check size={14} strokeWidth={2} aria-hidden="true" />;
}

function LinePreview({ text, entry }: { text: string; entry: WordbookWord }) {
  const dict = useMemo(() => new Map([[entry.w, entry]]), [entry]);
  return (
    <>
      {text.split(/(\s+)/).map((token, index) => {
        const hit = lookupWord(token, dict);
        if (hit?.w !== entry.w) return <span key={index}>{token}</span>;
        return <mark key={index}>{token}</mark>;
      })}
    </>
  );
}

function takeSession(mode: 'learn' | 'review') {
  return mode === 'review'
    ? useStudyStore.getState().dueQueue()
    : useStudyStore.getState().learnQueue();
}

export function WordCards({ mode = 'learn' }: { mode?: 'learn' | 'review' }) {
  const wordbook = usePlayerStore((state) => state.wordbook);
  const currentSong = usePlayerStore((state) => state.song);
  const setWordbookPrompt = usePlayerStore((state) => state.setWordbookPrompt);
  const setView = usePlayerStore((state) => state.setView);
  const playing = usePlayerStore((state) => state.playing);

  const study = useStudyStore((state) => state.state);
  const counts = useStudyStore((state) => state.counts);
  const reviewStudy = useStudyStore((state) => state.review);
  const setNewPerDay = useStudyStore((state) => state.setNewPerDay);

  const [session, setSession] = useState<StudyCardView[]>(() => takeSession(mode));
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [completed, setCompleted] = useState(false);
  const [rated, setRated] = useState<Set<string>>(new Set());
  const [lastOutcome, setLastOutcome] = useState<{ word: string; label: string } | null>(null);
  const [autoPlay, setAutoPlay] = useState(() => {
    try {
      return localStorage.getItem(AUTOPLAY_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem(AUTOSPEAK_KEY) !== '0';
    } catch {
      return true;
    }
  });

  const isReview = mode === 'review';
  const card = session[index] ?? null;
  const isPlayingSource =
    playing &&
    Boolean(card?.source?.song) &&
    currentSong?.id === card?.source?.song?.id &&
    currentSong?.platform === card?.source?.song?.platform;
  const intervals = useMemo(
    () => (card ? previewIntervals(study, card.word) : null),
    [study, card],
  );

  const reloadQueue = () => {
    const next = takeSession(mode);
    setSession(next);
    setIndex(0);
    setDirection(1);
    setStats(EMPTY_STATS);
    setCompleted(false);
    setRated(new Set());
    setLastOutcome(null);
  };

  useEffect(() => {
    reloadQueue();
    // 只在意模式与词书切换；复习后的 daily 变化由冻结的 session 承担
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wordbook?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTOPLAY_KEY, autoPlay ? '1' : '0');
    } catch {
      // 忽略
    }
  }, [autoPlay]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTOSPEAK_KEY, autoSpeak ? '1' : '0');
    } catch {
      // 忽略
    }
  }, [autoSpeak]);

  useEffect(() => {
    if (!card || !autoSpeak) return;
    const timer = window.setTimeout(() => speak(card.word), 180);
    return () => window.clearTimeout(timer);
  }, [card?.word, autoSpeak]);

  const playCard = async (target: StudyCardView | null, force = false) => {
    if (!target?.source) return;
    if (!force && !autoPlay) return;
    const sourceSong = target.source.song;
    if (sourceSong && sourceSong.id !== currentSong?.id) {
      await player.loadSong(sourceSong, { autoplay: false });
    }
    void player.seekTo(target.source.time, { play: true });
  };

  useEffect(() => {
    if (completed || !autoPlay) return;
    const target = session[index];
    if (!target?.source) return;
    // 打开卡片/翻到下一张时自动播原曲对应片段；播放器画面在词卡模式是隐藏的
    const timer = window.setTimeout(() => {
      void playCard(target);
    }, 650);
    return () => window.clearTimeout(timer);
    // playCard 只需跟随当前卡片与开关
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, session, autoPlay, completed]);

  const goTo = (target: number, nextDirection = 1) => {
    if (target < 0 || target >= session.length || completed) return;
    setDirection(nextDirection);
    setIndex(target);
  };

  const rate = (rating: Grade3) => {
    if (!card || completed || !wordbook || rated.has(card.word)) return;
    const outcome = reviewStudy({
      word: { word: card.word, entry: card.entry, source: card.source },
      bookId: wordbook.id,
      rating,
      source: card.source,
    });
    setRated((prev) => new Set(prev).add(card.word));
    setStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    if (outcome) {
      setLastOutcome({ word: card.word, label: getDueLabel(outcome.due) });
    }
    if (index + 1 >= session.length) {
      setCompleted(true);
      return;
    }
    setDirection(1);
    setIndex(index + 1);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(index + 1);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(index - 1, -1);
      }
      if (event.key === '1') rate('again');
      if (event.key === '2') rate('hard');
      if (event.key === '3') rate('good');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!wordbook) {
    return (
      <main className="cards-stage cards-empty-stage">
        <div className="cards-empty">
          <BookOpen size={26} />
          <h2>先选一本词书</h2>
          <p>词卡只从你的词书里出，不会硬凑。</p>
          <button type="button" className="login-button" onClick={() => setWordbookPrompt(true)}>
            选词书
          </button>
        </div>
      </main>
    );
  }

  if (!session.length && !completed) {
    return (
      <main className="cards-stage cards-empty-stage">
        <div className="cards-empty">
          {isReview ? <CheckCircle2 size={26} /> : <BookOpen size={26} />}
          <h2>{isReview ? '今天没有到期词' : '今天的新词已经清空'}</h2>
          <p>
            {isReview
              ? `已学 ${counts.learned} 个词 · 今日新词 ${counts.newWords} 个等待上车`
              : counts.newWords > 0
                ? '词书或歌曲刚同步，重新读一次队列试试。'
                : 'ts-fsrs 会在明天把该复习的词送回来。'}
          </p>
          <div className="cards-empty-actions">
            {isReview ? (
              <button type="button" className="login-button" onClick={() => setView('cards')}>
                去学新词
              </button>
            ) : counts.due > 0 ? (
              <button type="button" className="login-button" onClick={() => setView('review')}>
                去复习 {counts.due}
              </button>
            ) : null}
            {!isReview && counts.newWords > 0 ? (
              <button type="button" className="ghost-button" onClick={reloadQueue}>
                <RotateCcw size={14} />
                重新读取
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={() => setView('player')}>
              回到播放器
            </button>
          </div>
        </div>
      </main>
    );
  }

  const source = card?.source;
  const reviewedNew = study.daily.newWords.filter((item) =>
    study.daily.reviewed.includes(item.word),
  ).length;

  return (
    <main className="cards-stage">
      <section className="cards-intro">
        <p className="kicker">
          <span className="kicker-dot" />
          {isReview ? 'REVIEW · DUE WORDS' : 'NEW WORDS · DAILY'}
        </p>
        <h1>
          {isReview ? (
            <>
              到期的词，
              <br />
              今天还上。
            </>
          ) : (
            <>
              今天，
              <br />
              先记十个。
            </>
          )}
        </h1>
        <p className="cards-lede">
          {isReview
            ? `ts-fsrs 算出今天该复习 ${session.length} 个词；三档反馈会重排下一次间隔。`
            : `今日新词 ${session.length} 个 · 已评 ${reviewedNew}/${session.length}。优先从《${currentSong?.title ?? '当前歌曲'}》的歌词里提，不够再从词书补。`}
        </p>

        <div className="cards-song">
          <span className="cards-song-cover">
            {isReview ? (
              <BookOpen size={16} />
            ) : currentSong?.cover ? (
              <img src={currentSong.cover} alt="" />
            ) : (
              <BookOpen size={16} />
            )}
          </span>
          <span>
            <strong>{isReview ? `${wordbook.name} · 学习记录` : currentSong?.title ?? '未选歌'}</strong>
            <small>{isReview ? `已学 ${counts.learned} 词` : currentSong?.artistText}</small>
          </span>
          <span className="cards-song-count">{session.length} 词</span>
        </div>

        <div className="card-play-settings">
          <button
            type="button"
            className={`autoplay-toggle ${autoPlay ? 'is-on' : ''}`}
            onClick={() => setAutoPlay((value) => !value)}
            aria-pressed={autoPlay}
          >
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            翻卡时自动播那一句
            <em>{autoPlay ? '开' : '关'}</em>
          </button>
          <button
            type="button"
            className={`autoplay-toggle ${autoSpeak ? 'is-on' : ''}`}
            onClick={() => setAutoSpeak((value) => !value)}
            aria-pressed={autoSpeak}
          >
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            打开卡片时读单词
            <em>{autoSpeak ? '开' : '关'}</em>
          </button>
        </div>

        {!isReview ? (
          <label className="daily-limit">
            每天新词
            <span className="select-wrap">
              <select
                value={study.settings.newPerDay}
                onChange={(event) => setNewPerDay(Number(event.target.value))}
              >
                {[5, 10, 15, 20, 30].map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
              <ChevronDown className="select-chevron" size={12} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <em>改完下一轮生效</em>
          </label>
        ) : null}

        <div className="cards-wordlist" aria-label="本轮词表">
          <p className="search-section-label">{isReview ? '到期' : '这一轮'}</p>
          {session.map((item, itemIndex) => (
            <button
              type="button"
              key={item.word}
              className={`cards-word ${itemIndex === index ? 'is-active' : ''} ${rated.has(item.word) ? 'is-done' : ''}`}
              onClick={() => goTo(itemIndex, itemIndex > index ? 1 : -1)}
            >
              <span>{String(itemIndex + 1).padStart(2, '0')}</span>
              <strong>{item.word}</strong>
              <em>{shortMeaning(item.entry.m)}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="card-stage" aria-label={isReview ? '复习卡' : '新词卡'}>
        <div className="card-stack">
          <span className="stack-card stack-2" aria-hidden="true" />
          <span className="stack-card stack-1" aria-hidden="true" />

          {completed ? (
            <motion.div
              className="cards-complete"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <CheckCircle2 size={34} />
              <h2>{isReview ? '这一轮复习完了' : '今天的新词过完了'}</h2>
              <p>
                认识 {stats.good} · 模糊 {stats.hard} · 不认识 {stats.again}
              </p>
              <small>
                已交给 ts-fsrs 排期；到期词 {counts.due} 个，累计学过 {counts.learned} 个。
              </small>
              <div className="cards-complete-actions">
                <button type="button" className="login-button" onClick={reloadQueue}>
                  <RotateCcw size={14} />
                  再来一轮
                </button>
                {!isReview && counts.due > 0 ? (
                  <button type="button" className="ghost-button" onClick={() => setView('review')}>
                    去复习 {counts.due}
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={() => setView('player')}>
                  回到播放器
                </button>
              </div>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.article
                key={card.word}
                className="word-card"
                data-letter={card.entry.w.slice(0, 1).toUpperCase()}
                custom={direction}
                initial={{ opacity: 0, x: direction * 34, rotate: direction * 0.6 }}
                animate={{ opacity: 1, x: 0, rotate: 0 }}
                exit={{ opacity: 0, x: direction * -26, rotate: direction * -0.5 }}
                transition={{ type: 'spring', stiffness: 330, damping: 32 }}
              >
                <header className="word-card-head">
                  <span className="card-index">
                    {String(index + 1).padStart(2, '0')} <i>/ {String(session.length).padStart(2, '0')}</i>
                  </span>
                  <span className={`card-wordbook ${isReview ? 'is-review' : ''}`}>
                    {isReview ? '到期复习' : wordbook.name}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => speak(card.entry.w)}
                    aria-label="朗读"
                  >
                    <Volume2 size={17} />
                  </button>
                </header>

                {lastOutcome ? (
                  <span className="card-last-due">
                    上一个：{lastOutcome.word} · {lastOutcome.label}
                  </span>
                ) : null}

                <div className="word-card-title">
                  <h2>{card.entry.w}</h2>
                  {card.entry.p ? <span className="word-phonetic">/{card.entry.p}/</span> : null}
                </div>

                <div className="word-senses word-card-senses">
                  {splitWordSenses(card.entry.m).map((sense, senseIndex) => (
                    <span key={senseIndex}>{sense}</span>
                  ))}
                </div>

                {card.entry.syn?.length ? (
                  <div className="word-synonyms">
                    <span>近义词</span>
                    {card.entry.syn.map((word) => (
                      <em key={word}>{word}</em>
                    ))}
                  </div>
                ) : null}

                {card.entry.s ? (
                  <div className="word-example card-example">
                    <p>{card.entry.s.split('||')[0]}</p>
                    {card.entry.s.split('||')[1] ? <small>{card.entry.s.split('||')[1]}</small> : null}
                  </div>
                ) : null}

                {card.entry.exam ? (
                  <div className="word-exam">
                    <span>真题 · {card.entry.exam[1] || 'CET'}</span>
                    <p>{card.entry.exam[0]}</p>
                  </div>
                ) : null}

                {source ? (
                  <div className="card-lyric">
                    <span className="card-lyric-label">
                      <Headphones size={12} />
                      <b>歌词片段</b>
                      {source.songTitle} · {formatTime(source.time)}
                      {isPlayingSource ? (
                        <span className="card-lyric-wave" aria-label="正在播放">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : null}
                    </span>
                    <p>
                      <LinePreview text={source.lineText} entry={card.entry} />
                    </p>
                    <div className="card-lyric-actions">
                      <button
                        type="button"
                        className="mini-button warm"
                        onClick={() => void playCard(card, true)}
                      >
                        <Play size={12} fill="currentColor" />
                        听这一句
                      </button>
                      <button
                        type="button"
                        className="mini-button"
                        onClick={async () => {
                          if (source.song) await player.loadSong(source.song, { autoplay: false });
                          setView('player');
                          void player.seekTo(source.time, { play: true });
                        }}
                      >
                        去播放器看
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="card-lyric is-empty-source">
                    <span className="card-lyric-label">词书里的词</span>
                    <p>这个词暂时没有落到某句歌词上，先把词义和例句记住。</p>
                  </div>
                )}

                <footer className="word-card-actions">
                  {(['again', 'hard', 'good'] as Grade3[]).map((rating) => (
                    <button
                      type="button"
                      key={rating}
                      className={`rate rate-${rating}`}
                      onClick={() => rate(rating)}
                      disabled={rated.has(card.word)}
                    >
                      <span className="rate-icon">
                        <GradeIcon rating={rating} />
                      </span>
                      {rating === 'again' ? '不认识' : rating === 'hard' ? '模糊' : '认识'}
                      {intervals ? <em className="rate-days">{intervals[rating]}天</em> : null}
                      <kbd>{rating === 'again' ? 1 : rating === 'hard' ? 2 : 3}</kbd>
                    </button>
                  ))}
                </footer>
                {rated.has(card.word) ? (
                  <p className="card-rated-note">这张已经评过，翻到下一张继续。</p>
                ) : null}
              </motion.article>
            </AnimatePresence>
          )}
        </div>

        {!completed ? (
          <div className="card-toolbar">
            <button
              type="button"
              className="icon-button"
              onClick={() => goTo(index - 1, -1)}
              disabled={index === 0}
              aria-label="上一张"
            >
              <ArrowLeft size={17} />
            </button>
            <div className="card-dots" aria-hidden="true">
              {session.map((item, itemIndex) => (
                <span key={item.word} className={itemIndex === index ? 'is-active' : ''} />
              ))}
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => goTo(index + 1)}
              disabled={index >= session.length - 1}
              aria-label="下一张"
            >
              <ArrowRight size={17} />
            </button>
          </div>
        ) : null}
      </section>

      {!completed && card ? (
        <div className="mobile-rate-bar" role="group" aria-label="三档反馈">
          {(['again', 'hard', 'good'] as Grade3[]).map((rating) => (
            <button
              type="button"
              key={rating}
              className={`rate rate-${rating}`}
              onClick={() => rate(rating)}
              disabled={rated.has(card.word)}
            >
              <span className="rate-icon">
                <GradeIcon rating={rating} />
              </span>
              {rating === 'again' ? '不认识' : rating === 'hard' ? '模糊' : '认识'}
              {intervals ? <em className="rate-days">{intervals[rating]}天</em> : null}
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}
