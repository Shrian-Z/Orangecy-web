import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Maximize2, Pause, Play, Sparkles } from 'lucide-react';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { ImmersivePlayer } from '@/components/ImmersivePlayer';
import type { Song } from '@/types';

function TrackMeta({ song }: { song: Song | null }) {
  if (!song) {
    return (
      <div className="track-meta">
        <p className="kicker">NOW PLAYING</p>
        <h1 className="track-title">还没有选歌</h1>
        <p className="track-sub">从网易云搜一首，歌词会带着时间戳落在这里。</p>
      </div>
    );
  }
  return (
    <div className="track-meta">
      <p className="kicker">
        <span className="kicker-dot" />
        NOW PLAYING{' '}
        <span className="kicker-platform">
          ·{' '}
          {song.platform === 'qq'
            ? 'QQ音乐'
            : song.platform === 'kugou'
              ? '酷狗音乐'
              : song.platform === 'bodian'
                ? '波点音乐'
                : '网易云音乐'}
        </span>
      </p>
      <h1 className="track-title" title={song.title}>
        {song.title}
      </h1>
      <p className="track-sub">
        {song.artistText}
        {song.album ? <span className="track-album"> · {song.album}</span> : null}
      </p>
    </div>
  );
}

export function CoverStage() {
  const song = usePlayerStore((state) => state.song);
  const playing = usePlayerStore((state) => state.playing);
  const loading = usePlayerStore((state) => state.loadingSong);
  const playInfo = usePlayerStore((state) => state.playInfo);
  const setView = usePlayerStore((state) => state.setView);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const drawer = usePlayerStore((state) => state.drawer);

  const artRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const manualReduce = usePlayerStore((state) => state.reduceMotion);
  const reducedMotion = Boolean(reduce || manualReduce);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [immersive, setImmersive] = useState(false);
  const gesture = useRef({ x: 0, y: 0, active: false });
  const suppressClick = useRef(false);

  useEffect(() => {
    setImmersive(false);
  }, [song?.id]);

  useEffect(() => {
    if (drawer) setImmersive(false);
  }, [drawer]);

  const onCoverPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, active: true };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCoverPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!gesture.current.active) return;
    gesture.current.active = false;
    const dx = event.clientX - gesture.current.x;
    const dy = event.clientY - gesture.current.y;
    const horizontal = Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3;
    const upward = dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.3;

    if (horizontal) {
      suppressClick.current = true;
      const queue = usePlayerStore.getState().queue;
      if (dx < 0) {
        if (queue.length > 1) void player.next();
        else void player.seekTo(currentTime + 10, { play: true });
      } else if (queue.length > 1) {
        void player.previous();
      } else {
        void player.seekTo(currentTime - 10, { play: true });
      }
    } else if (upward && song) {
      suppressClick.current = true;
      setImmersive(true);
    }
  };

  const onCoverClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    void player.toggle();
  };

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = artRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: px * 7, y: -py * 7 });
  };

  return (
    <section className="art-column" aria-label="正在播放">
      <div className="cover-outer">
        <div
          className="cover-float"
          ref={artRef}
          onMouseMove={onMove}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        >
          <button
            type="button"
            className="cover-button"
            onClick={onCoverClick}
            onPointerDown={onCoverPointerDown}
            onPointerUp={onCoverPointerUp}
            onPointerCancel={() => { gesture.current.active = false; }}
            aria-label={playing ? '暂停' : '播放'}
            title="点击播放 · 左右滑切歌 · 上滑放大"
            style={{ transform: `perspective(1000px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` }}
          >
            {!immersive ? (
              <motion.div
                layoutId="cover-art"
                layout
                className="cover-art"
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30 }}
              >
                {song?.cover ? (
                  <img className="cover-image" src={song.cover} alt={`${song.title} 封面`} draggable={false} />
                ) : (
                  <span className="cover-fallback">
                    <span className="cover-fallback-mark">O</span>
                  </span>
                )}
              </motion.div>
            ) : (
              <span className="cover-art-placeholder" aria-hidden="true" />
            )}
            <span className="cover-play">
              {loading ? (
                <span className="spinner" />
              ) : playing ? (
                <Pause size={26} fill="currentColor" strokeWidth={1.6} />
              ) : (
                <Play size={26} fill="currentColor" strokeWidth={1.6} className="play-glyph" />
              )}
            </span>
            {playInfo?.trial ? <span className="trial-tag">试听 30s</span> : null}
          </button>
          <button
            type="button"
            className="cover-expand"
            onClick={(event) => {
              event.stopPropagation();
              setImmersive(true);
            }}
            disabled={!song}
            aria-label="放大封面"
            title="放大封面"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      <TrackMeta song={song} />

      <div className="check-strip" aria-label="推荐">
        <button type="button" className="check-chip recommend-chip" onClick={() => setView('recommend')}>
          <Sparkles size={13} strokeWidth={1.8} />
          <span>每日推荐</span>
        </button>
      </div>

      {immersive ? createPortal(<ImmersivePlayer onClose={() => setImmersive(false)} />, document.body) : null}
    </section>
  );
}
