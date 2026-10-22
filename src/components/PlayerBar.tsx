import { useEffect, useMemo, useState } from 'react';
import {
  ListMusic,
  MoreHorizontal,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { formatTime } from '@/lib/lrc';

export function PlayerBar({
  visible,
  onWake,
  onHoldChange,
}: {
  visible: boolean;
  onWake: () => void;
  onHoldChange: (hold: boolean) => void;
}) {
  const song = usePlayerStore((state) => state.song);
  const playing = usePlayerStore((state) => state.playing);
  const loading = usePlayerStore((state) => state.loadingSong);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const volume = usePlayerStore((state) => state.volume);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const playInfo = usePlayerStore((state) => state.playInfo);

  const [dragValue, setDragValue] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shown = dragValue ?? currentTime;
  const progress = duration ? Math.min(100, (shown / duration) * 100) : 0;

  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  useEffect(() => () => onHoldChange(false), [onHoldChange]);

  const volumeIcon = useMemo(() => {
    if (volume <= 0) return <VolumeX size={15} strokeWidth={1.8} />;
    if (volume < 0.5) return <Volume1 size={15} strokeWidth={1.8} />;
    return <Volume2 size={15} strokeWidth={1.8} />;
  }, [volume]);

  const commitDrag = () => {
    if (dragValue === null) return;
    void player.seekTo(dragValue, { play: false });
    setDragValue(null);
  };

  const act = (action: () => void) => {
    onWake();
    action();
  };

  return (
    <footer
      className={`playercapsule ${visible ? 'is-visible' : 'is-hidden'} ${expanded ? 'is-expanded' : ''}`}
      aria-label="播放控制"
      aria-hidden={!visible}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') onWake();
      }}
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.matches(':focus-visible')) onHoldChange(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onHoldChange(false);
        }
      }}
    >
      {expanded ? (
        <div className="capsule-secondary">
          <span className="capsule-time">
            {formatTime(shown)}
            <i>/</i>
            {formatTime(duration)}
          </span>

          <div className="capsule-volume">
            <button
              type="button"
              className="control ghost"
              onClick={() => act(() => player.toggleMute())}
              aria-label="静音"
              title="静音"
            >
              {volumeIcon}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
              onPointerDown={() => onHoldChange(true)}
              onPointerUp={() => onHoldChange(false)}
              onPointerCancel={() => onHoldChange(false)}
              onBlur={() => onHoldChange(false)}
              aria-label="音量"
            />
          </div>

          <button
            type="button"
            className="queue-chip"
            title={queue.length ? `播放列表 ${queueIndex + 1}/${queue.length}` : '暂无播放列表'}
            aria-label="播放列表"
            onClick={() => act(() => usePlayerStore.getState().openDrawer('queue'))}
          >
            <ListMusic size={16} strokeWidth={1.8} />
          </button>
        </div>
      ) : null}

      <div className="capsule-main">
        <button
          type="button"
          className="control"
          onClick={() => act(() => void player.previous())}
          aria-label="上一首"
          disabled={!song}
        >
          <SkipBack size={18} fill="currentColor" strokeWidth={1.2} />
        </button>

        <button
          type="button"
          className="play-button"
          onClick={() => act(() => void player.toggle())}
          aria-label={playing ? '暂停' : '播放'}
          disabled={!song || playInfo?.available === false}
        >
          {loading ? (
            <span className="spinner" />
          ) : playing ? (
            <Pause size={19} fill="currentColor" strokeWidth={1.4} />
          ) : (
            <Play size={19} fill="currentColor" strokeWidth={1.4} className="play-glyph" />
          )}
        </button>

        <button
          type="button"
          className="control"
          onClick={() => act(() => void player.next())}
          aria-label="下一首"
          disabled={queue.length < 2}
        >
          <SkipForward size={18} fill="currentColor" strokeWidth={1.2} />
        </button>

        <button
          type="button"
          className={`capsule-more ${expanded ? 'is-on' : ''}`}
          onClick={() =>
            act(() => {
              setExpanded((value) => !value);
            })
          }
          aria-label="更多播放控制"
          aria-expanded={expanded}
          title="更多播放控制"
        >
          <MoreHorizontal size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="capsule-progress" style={{ '--played': `${progress}%` } as React.CSSProperties}>
        <span className="range-rail" aria-hidden="true">
          <i />
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.05}
          value={shown}
          onChange={(event) => setDragValue(Number(event.target.value))}
          onPointerDown={() => {
            onWake();
            onHoldChange(true);
          }}
          onPointerUp={() => {
            commitDrag();
            onHoldChange(false);
          }}
          onPointerCancel={() => {
            commitDrag();
            onHoldChange(false);
          }}
          onKeyUp={commitDrag}
          onBlur={() => {
            commitDrag();
            onHoldChange(false);
          }}
          disabled={!duration}
          aria-label="播放进度"
        />
      </div>
    </footer>
  );
}
