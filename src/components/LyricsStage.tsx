import { memo, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { BookOpen, Loader2, Search } from 'lucide-react';
import { player } from '@/player';
import { currentLineIndex, usePlayerStore } from '@/store';
import { formatTime } from '@/lib/lrc';
import { buildSongMatches } from '@/lib/wordbook';
import type { WordbookWord } from '@/lib/wordbook';
import type { LyricLine, LyricWord } from '@/types';
import { wordPhase } from '@/lib/wordTiming';

function TextWithWords({
  text,
  entries,
  focusKey,
  wordTimes,
  activeTime,
  onWord,
}: {
  text: string;
  entries?: Map<string, WordbookWord>;
  focusKey?: string;
  wordTimes?: LyricWord[];
  activeTime?: number;
  onWord: (surface: string, entry: WordbookWord) => void;
}) {
  let ordinal = -1;
  return (
    <>
      {text.split(/(\s+)/).map((token, index) => {
        if (!token) return null;
        const space = /^\s+$/.test(token);
        if (!space) ordinal += 1;
        const phase =
          !space && activeTime !== undefined ? wordPhase(wordTimes?.[ordinal], activeTime) : null;
        const phaseClass = phase ? `is-${phase}` : '';
        const key = token.toLowerCase();
        const entry = entries?.get(key);
        if (!entry) {
          return phase ? (
            <span className={`lyric-word ${phaseClass}`} data-text={token} key={index}>
              {token}
            </span>
          ) : (
            <span key={index}>{token}</span>
          );
        }
        return (
          <span
            className={`lyric-word is-target ${focusKey === key ? 'is-focus' : ''} ${phaseClass}`}
            data-target="true"
            data-text={token}
            data-focus={focusKey === key ? 'true' : undefined}
            key={index}
            role="button"
            tabIndex={0}
            title={`${entry.w} · ${entry.m}`}
            onClick={(event) => {
              event.stopPropagation();
              onWord(token, entry);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onWord(token, entry);
            }}
          >
            {token}
            {focusKey === key ? (
              <>
                {' '}
                <span className="lyric-word-note">
                  <b>{entry.p}</b> {entry.m}
                </span>
              </>
            ) : null}
          </span>
        );
      })}
    </>
  );
}

function LineView({
  line,
  active,
  entries,
  onSelect,
  onWord,
  register,
  focus,
  progress,
  activeTime,
}: {
  line: LyricLine;
  active: boolean;
  entries?: Map<string, WordbookWord>;
  onSelect: () => void;
  onWord: (surface: string, entry: WordbookWord) => void;
  register: (node: HTMLDivElement | null) => void;
  focus?: { surface: string; entry: WordbookWord } | null;
  progress: number;
  activeTime?: number;
}) {
  const focusKey = active && focus ? focus.surface.toLowerCase() : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      ref={register}
      className={`lyric-line ${active ? 'is-active' : ''}`}
      style={active ? ({ '--line-progress': `${progress}%` } as CSSProperties) : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
      }}
      aria-current={active ? 'true' : undefined}
      title={`从 ${formatTime(line.time)} 播放`}
    >
      <span className="lyric-time">{formatTime(line.time)}</span>
      <span className="lyric-body">
        <span className="lyric-text">
          <TextWithWords
            text={line.text}
            entries={entries}
            focusKey={focusKey}
            wordTimes={line.words}
            activeTime={active ? activeTime : undefined}
            onWord={onWord}
          />
        </span>
        {line.translation ? <span className="lyric-translation">{line.translation}</span> : null}
      </span>
      {active ? <span className="lyric-line-progress" aria-hidden="true" /> : null}
    </div>
  );
}

const Line = memo(
  LineView,
  (prev, next) => {
    if (prev.line !== next.line || prev.active !== next.active || prev.entries !== next.entries) {
      return false;
    }
    if (!prev.active) return true;
    return (
      prev.progress === next.progress &&
      prev.activeTime === next.activeTime &&
      prev.focus?.surface === next.focus?.surface &&
      prev.focus?.entry === next.focus?.entry
    );
  },
);

export function LyricsStage() {
  const lines = usePlayerStore((state) => state.lines);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const loading = usePlayerStore((state) => state.loadingSong);
  const loadError = usePlayerStore((state) => state.loadError);
  const openDrawer = usePlayerStore((state) => state.openDrawer);
  const song = usePlayerStore((state) => state.song);
  const wordbook = usePlayerStore((state) => state.wordbook);
  const setWordFocus = usePlayerStore((state) => state.setWordFocus);
  const setWordbookPrompt = usePlayerStore((state) => state.setWordbookPrompt);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastInteraction = useRef(0);
  const hasScrolled = useRef(false);
  const active = currentLineIndex(lines, currentTime);

  const matches = useMemo(
    () => (wordbook && lines.length ? buildSongMatches(lines, wordbook) : null),
    [wordbook, lines],
  );

  const lineProgress = useMemo(() => {
    if (active < 0) return 0;
    const start = lines[active]?.time ?? 0;
    const end = lines[active + 1]?.time ?? (duration > start ? duration : start + 4);
    if (end <= start) return 0;
    return Math.max(0, Math.min(100, ((currentTime - start) / (end - start)) * 100));
  }, [active, lines, currentTime, duration]);

  const focus = useMemo(() => {
    if (!matches || active < 0) return null;
    const line = lines[active];
    const entries = line ? matches.byLine.get(line.key) : null;
    const first = entries ? [...entries.entries()][0] : null;
    return first ? { surface: first[0], entry: first[1] } : null;
  }, [matches, lines, active]);

  useEffect(() => {
    lineRefs.current = [];
    hasScrolled.current = false;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [song?.id]);

  useEffect(() => {
    if (!lines.length || active < 0) return;
    if (Date.now() - lastInteraction.current < 2600) return;
    const container = scrollRef.current;
    const node = lineRefs.current[active];
    if (!container || !node) return;
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const offset = nodeRect.top - containerRect.top - container.clientHeight * 0.4;
    container.scrollTo({
      top: container.scrollTop + offset,
      behavior: hasScrolled.current ? 'smooth' : 'auto',
    });
    hasScrolled.current = true;
  }, [active, lines.length]);

  const progress = useMemo(() => {
    if (!duration) return 0;
    return Math.max(0, Math.min(100, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  const markInteraction = () => {
    lastInteraction.current = Date.now();
  };

  const focusWord = (
    line: LyricLine,
    index: number,
    surface: string,
    entry: WordbookWord,
  ) => {
    // 点词 = 从这一句听 + 看释义，和 PRD 里「单词卡播对应片段」保持一致
    void player.seekTo(line.time, { play: true });
    setWordFocus({
      surface,
      entry,
      lineIndex: index,
      time: line.time,
      lineText: line.text,
      songTitle: song?.title ?? '未知曲目',
      songId: song?.id ?? '',
    });
  };

  return (
    <section className="lyrics-panel" aria-label="歌词">
      <header className="lyrics-head">
        <div className="lyrics-head-left">
          <div className="lyrics-title">
            <span className="lyrics-live" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            歌词
            <em>{lines.length ? `${lines.length} 行` : '等待载入'}</em>
          </div>
          <button
            type="button"
            className={`wordbook-pill ${matches?.count ? 'has-words' : ''}`}
            onClick={() => setWordbookPrompt(true)}
            title={wordbook ? '切换词书' : '选择词书'}
          >
            <BookOpen size={12} strokeWidth={1.9} />
            {wordbook ? (
              <>
                {wordbook.name}
                <i>·</i>
                {matches ? `命中 ${matches.count} 词` : '正在匹配'}
              </>
            ) : (
              '选词书'
            )}
          </button>
        </div>
        <p className="lyrics-hint">
          {matches?.count
            ? '点词看释义 · 点句跳转'
            : '点击任意一句，从那一秒开始播'}
        </p>
      </header>

      <div
        className="lyrics-scroll"
        ref={scrollRef}
        onWheel={markInteraction}
        onTouchMove={markInteraction}
        onPointerDown={markInteraction}
      >
        {loading && !lines.length ? (
          <div className="lyrics-skeleton" aria-label="歌词加载中">
            {[72, 54, 84, 46, 66, 58, 78, 42, 63].map((width, index) => (
              <span key={index} style={{ width: `${width}%` }} />
            ))}
          </div>
        ) : lines.length ? (
          <div className="lyrics-list">
            {lines.map((line, index) => (
              <Line
                key={line.key}
                line={line}
                active={index === active}
                entries={matches?.byLine.get(line.key)}
                focus={focus}
                progress={lineProgress}
                activeTime={index === active ? currentTime : undefined}
                register={(node) => {
                  lineRefs.current[index] = node;
                }}
                onSelect={() => {
                  lastInteraction.current = 0;
                  void player.seekTo(line.time, { play: true });
                }}
                onWord={(surface, entry) => focusWord(line, index, surface, entry)}
              />
            ))}
          </div>
        ) : (
          <div className="lyrics-empty">
            {loading ? <Loader2 className="spin" size={22} /> : null}
            <p>{loadError ?? '这首歌还没有带时间戳的歌词'}</p>
            <span>换一首有歌词的歌，或稍后再试。</span>
            <button type="button" className="ghost-button" onClick={() => openDrawer('search')}>
              <Search size={15} />
              去搜歌
            </button>
          </div>
        )}
      </div>

      <footer className="lyrics-foot">
        <span>
          {lines.length ? `首句 ${formatTime(lines[0].time)}` : '原曲时间轴'}
          <i>·</i>
          当前 {formatTime(currentTime)}
        </span>
        <span className="lyrics-foot-right">不切片 · 直接 seek 原曲</span>
        <span className="lyrics-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </span>
      </footer>
    </section>
  );
}
