import { useMemo, useState } from 'react';
import {
  ListMusic,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { formatTime } from '@/lib/lrc';

export function PlayerBar() {
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
  const shown = dragValue ?? currentTime;
  const progress = duration ? Math.min(100, (shown / duration) * 100) : 0;
  const volumeIcon = useMemo(() => {
    if (volume <= 0) return <VolumeX size={17} strokeWidth={1.8} />;
    if (volume < 0.5) return <Volume1 size={17} strokeWidth={1.8} />;
    return <Volume2 size={17} strokeWidth={1.8} />;
  }, [volume]);

  const commitDrag = () => {
    if (dragValue === null) return;
    void player.seekTo(dragValue, { play: false });
    setDragValue(null);
  };

  return (
    <footer className="playerbar" aria-label="播放控制">
      <div
        className="player-progress"
        style={{ '--played': `${progress}%` } as React.CSSProperties}
      >
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
          onPointerUp={commitDrag}
          onKeyUp={commitDrag}
          onBlur={commitDrag}
          disabled={!duration}
          aria-label="播放进度"
        />
      </div>

      <div className="player-now">
        <span className={`mini-cover ${playing ? 'is-spinning' : ''}`}>
          {song?.cover ? <img src={song.cover} alt="" /> : <span>O</span>}
        </span>
        <span className="mini-meta">
          <strong>{song?.title ?? 'Orangecy'}</strong>
          <small>
            {song?.artistText ?? '选一首歌开始'}
            {playInfo?.br ? <i> · {Math.round(playInfo.br / 1000)}kbps</i> : null}
          </small>
        </span>
      </div>

      <div className="player-controls">
        <button type="button" className="control ghost" disabled title="随机播放（排期中）" aria-label="随机播放">
          <Shuffle size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="control"
          onClick={() => void player.previous()}
          aria-label="上一首"
          disabled={!song}
        >
          <SkipBack size={20} fill="currentColor" strokeWidth={1.2} />
        </button>
        <button
          type="button"
          className="play-button"
          onClick={() => void player.toggle()}
          aria-label={playing ? '暂停' : '播放'}
          disabled={!song || playInfo?.available === false}
        >
          {loading ? (
            <span className="spinner" />
          ) : playing ? (
            <Pause size={21} fill="currentColor" strokeWidth={1.4} />
          ) : (
            <Play size={21} fill="currentColor" strokeWidth={1.4} className="play-glyph" />
          )}
        </button>
        <button
          type="button"
          className="control"
          onClick={() => void player.next()}
          aria-label="下一首"
          disabled={queue.length < 2}
        >
          <SkipForward size={20} fill="currentColor" strokeWidth={1.2} />
        </button>
        <button type="button" className="control ghost" disabled title="单曲循环（排期中）" aria-label="单曲循环">
          <Repeat size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="player-side">
        <span className="player-time">
          {formatTime(shown)}
          <i>/</i>
          {formatTime(duration)}
        </span>
        <div className="volume">
          <button type="button" className="control ghost" onClick={() => player.toggleMute()} aria-label="静音">
            {volumeIcon}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => player.setVolume(Number(event.target.value))}
            aria-label="音量"
          />
        </div>
        <button
          type="button"
          className="queue-chip"
          title={queue.length ? `播放列表 ${queueIndex + 1}/${queue.length}` : '暂无播放列表'}
          onClick={() => usePlayerStore.getState().openDrawer('queue')}
        >
          <ListMusic size={16} strokeWidth={1.8} />
          {queue.length ? `${queueIndex + 1}/${queue.length}` : '列表'}
        </button>
      </div>
    </footer>
  );
}
