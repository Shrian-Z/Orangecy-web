import { useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Maximize2, Pause, Play, X } from 'lucide-react';
import { player } from '@/player';
import { currentLineIndex, usePlayerStore } from '@/store';
import { formatTime } from '@/lib/lrc';
import { buildSongMatches } from '@/lib/wordbook';
import { wordPhase } from '@/lib/wordTiming';

export function ImmersivePlayer({ onClose }: { onClose: () => void }) {
  const song = usePlayerStore((state) => state.song);
  const lines = usePlayerStore((state) => state.lines);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const playing = usePlayerStore((state) => state.playing);
  const wordbook = usePlayerStore((state) => state.wordbook);
  const reduce = useReducedMotion();
  const manualReduce = usePlayerStore((state) => state.reduceMotion);
  const reducedMotion = Boolean(reduce || manualReduce);
  const active = currentLineIndex(lines, currentTime);
  const line = active >= 0 ? lines[active] : null;
  const matches = useMemo(
    () => (wordbook && lines.length ? buildSongMatches(lines, wordbook) : null),
    [wordbook, lines],
  );
  const entries = line ? matches?.byLine.get(line.key) : null;
  const focus = entries ? [...entries.entries()][0] : null;
  const focusKey = focus?.[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="immersive world-blue" role="dialog" aria-modal="true" aria-label="沉浸播放器">
      <button type="button" className="immersive-close" onClick={onClose} aria-label="收起沉浸播放器">
        <X size={20} />
      </button>

      <div className="immersive-content">
        <motion.div
          layoutId="cover-art"
          layout
          className="immersive-art"
          transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 250, damping: 30 }}
        >
          {song?.cover ? (
            <img src={song.cover} alt={`${song.title} 封面`} draggable={false} />
          ) : (
            <span className="immersive-art-fallback">O</span>
          )}
        </motion.div>

        <div className="immersive-meta">
          <p className="kicker">
            <span className="kicker-dot" />
            IMMERSIVE · ORANGECY
          </p>
          <h2>{song?.title ?? '还没有选歌'}</h2>
          <p>{song?.artistText ?? '搜一首歌开始'}</p>
        </div>

        <div className="immersive-lyric" aria-live="polite">
          <p>
            {line
              ? (() => {
                  let ordinal = -1;
                  return line.text.split(/(\s+)/).map((token, index) => {
                    if (!token) return null;
                    const space = /^\s+$/.test(token);
                    if (!space) ordinal += 1;
                    const phase = !space ? wordPhase(line.words?.[ordinal], currentTime) : null;
                    const phaseClass = phase ? `is-${phase}` : '';
                    const key = token.toLowerCase();
                    const entry = entries?.get(key);
                    if (!entry) {
                      if (phase) {
                        return (
                          <span
                            className={`immersive-word lyric-word ${phaseClass}`}
                            data-text={token}
                            key={index}
                          >
                            {token}
                          </span>
                        );
                      }
                      return token;
                    }
                    return (
                      <span
                        className={`immersive-word lyric-word is-target ${focusKey === key ? 'is-focus' : ''} ${phaseClass}`}
                        data-text={token}
                        key={index}
                      >
                      {token}
                      {focusKey === key ? (
                        <>
                          {' '}
                          <span className="immersive-word-note">
                            <b>{entry.p}</b> {entry.m}
                          </span>
                        </>
                        ) : null}
                      </span>
                    );
                  });
                })()
              : '歌词还在路上'}
          </p>
          {line?.translation ? <span>{line.translation}</span> : null}
        </div>

        <div className="immersive-progress">
          <span>{formatTime(currentTime)}</span>
          <div
            className="range-shell"
            style={{
              '--played': `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%`,
            } as React.CSSProperties}
          >
            <span className="range-rail" aria-hidden="true">
              <i />
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.1)}
              step={0.05}
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => void player.seekTo(Number(event.target.value), { play: false })}
              disabled={!duration}
              aria-label="播放进度"
            />
          </div>
          <span>{formatTime(duration)}</span>
        </div>

        <div className="immersive-controls">
          <button
            type="button"
            className="immersive-play"
            onClick={() => void player.toggle()}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="play-glyph" />}
          </button>
          <button type="button" className="immersive-hint" onClick={onClose}>
            <Maximize2 size={14} />
            收起
          </button>
        </div>
      </div>
    </div>
  );
}
