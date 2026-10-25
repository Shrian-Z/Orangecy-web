import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, WheelEvent } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Disc3,
  Loader2,
  Music2,
  Pause,
  Play,
  RotateCw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { api } from '@/api';
import { player } from '@/audio/source';
import { currentLineIndex, usePlayerStore } from '@/audio/store';
import { useAppStore } from '@/state/app';
import type { Playlist, Song } from '@/types';

const PAGE = 100;
const LIFTS = [-24, 20, -6, 30, -18, 10];

type Status = 'idle' | 'loading' | 'ready' | 'error';

function coverUrl(url: string | null, size: number) {
  return url ? `${url}?param=${size}y${size}` : undefined;
}

function Spinner() {
  return <Loader2 className="platform-spin" size={22} strokeWidth={1.8} aria-hidden="true" />;
}

/**
 * The user's own playlists only (created + collected on a connected platform).
 * No search, no recommendations. Full-song playback lives here and is paused and
 * its queue cleared when the world is left, so FocusCard never inherits it.
 */
export function PlaylistWorld({ active }: { active: boolean }) {
  const setView = useAppStore((store) => store.setView);
  const [shelf, setShelf] = useState<{ status: Status; loggedIn: boolean; playlists: Playlist[] }>({
    status: 'idle',
    loggedIn: false,
    playlists: [],
  });
  const [open, setOpen] = useState<Playlist | null>(null);
  const [owned, setOwned] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const wasActive = useRef(false);
  const currentId = usePlayerStore((store) => store.song?.id ?? null);

  const loadShelf = useCallback(async () => {
    setShelf((previous) => ({ ...previous, status: 'loading' }));
    try {
      const result = await api.playlists();
      setShelf({ status: 'ready', loggedIn: result.loggedIn, playlists: result.playlists });
    } catch (error) {
      console.warn('[playlists]', error);
      setShelf((previous) => ({ ...previous, status: 'error' }));
    }
  }, []);

  useEffect(() => {
    if (active) {
      wasActive.current = true;
      if (shelf.status === 'idle' || shelf.status === 'error' || (shelf.status === 'ready' && !shelf.loggedIn)) {
        void loadShelf();
      }
      return;
    }
    if (!wasActive.current) return;
    wasActive.current = false;
    if (!owned) return;
    if (usePlayerStore.getState().playing) void player.toggle();
    usePlayerStore.getState().setQueue([], -1);
    setOwned(false);
    setLyricsOpen(false);
  }, [active]);

  const play = useCallback((songs: Song[], index: number) => {
    // FocusCard 的片段序列结束时会把音量停在 0
    player.setVolume(1);
    setOwned(true);
    void player.playFromList(songs, index);
  }, []);

  return (
    <div className="world">
      {open ? (
        <TrackList
          key={open.id}
          playlist={open}
          currentId={owned ? currentId : null}
          onBack={() => setOpen(null)}
          onPlay={play}
        />
      ) : (
        <Shelf
          status={shelf.status}
          loggedIn={shelf.loggedIn}
          playlists={shelf.playlists}
          onOpen={setOpen}
          onRetry={() => void loadShelf()}
          onConnect={() => setView('me')}
        />
      )}
      {owned && lyricsOpen ? <LyricView onClose={() => setLyricsOpen(false)} /> : null}
      {owned ? <NowPlaying onLyrics={() => setLyricsOpen((value) => !value)} /> : null}
    </div>
  );
}

function Shelf({
  status,
  loggedIn,
  playlists,
  onOpen,
  onRetry,
  onConnect,
}: {
  status: Status;
  loggedIn: boolean;
  playlists: Playlist[];
  onOpen: (playlist: Playlist) => void;
  onRetry: () => void;
  onConnect: () => void;
}) {
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY;
  };

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="world-state">
        <Spinner />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="world-state">
        <button type="button" className="qr-retry" onClick={onRetry} aria-label="重试">
          <RotateCw size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    );
  }
  if (!loggedIn || !playlists.length) {
    return (
      <div className="world-state">
        <span className="empty-glyph" aria-hidden="true">
          <Disc3 size={28} strokeWidth={1.4} />
        </span>
        {loggedIn ? null : (
          <button type="button" className="world-connect" onClick={onConnect}>
            去连接音源
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="shelf" onWheel={onWheel}>
      {playlists.map((playlist, index) => (
        <button
          type="button"
          key={playlist.id}
          className={`shelf-card ${playlist.liked ? 'is-liked' : ''}`}
          style={
            {
              '--lift': `${LIFTS[index % LIFTS.length]}px`,
              '--delay': `${-(index * 0.9)}s`,
            } as CSSProperties
          }
          onClick={() => onOpen(playlist)}
        >
          <span className="shelf-cover">
            {playlist.cover ? (
              <img
                src={coverUrl(playlist.cover, 400)}
                alt=""
                loading="lazy"
                draggable={false}
                referrerPolicy="no-referrer"
              />
            ) : (
              <Disc3 size={28} strokeWidth={1.4} aria-hidden="true" />
            )}
          </span>
          <span className="shelf-name">{playlist.name}</span>
          <span className="shelf-count">{playlist.trackCount}</span>
        </button>
      ))}
    </div>
  );
}

function TrackList({
  playlist,
  currentId,
  onBack,
  onPlay,
}: {
  playlist: Playlist;
  currentId: string | null;
  onBack: () => void;
  onPlay: (songs: Song[], index: number) => void;
}) {
  const [page, setPage] = useState<{ songs: Song[]; done: boolean; status: Status }>({
    songs: [],
    done: false,
    status: 'loading',
  });
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(
    async (offset: number) => {
      if (busy.current) return;
      busy.current = true;
      setPage((previous) => ({ ...previous, status: 'loading' }));
      try {
        const result = await api.playlistTracks(playlist.id, offset, PAGE);
        setPage((previous) => ({
          songs: [...previous.songs, ...result.songs],
          done: result.songs.length < PAGE,
          status: 'ready',
        }));
      } catch (error) {
        console.warn('[playlist]', error);
        setPage((previous) => ({ ...previous, status: 'error' }));
      } finally {
        busy.current = false;
      }
    },
    [playlist.id],
  );

  useEffect(() => {
    void loadMore(0);
  }, [loadMore]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || page.done || page.status !== 'ready') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore(page.songs.length);
      },
      { rootMargin: '480px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [page, loadMore]);

  return (
    <div className="tracks">
      <header className="page-head">
        <button type="button" className="icon-action" onClick={onBack} aria-label="返回">
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <span className="page-title">{playlist.name}</span>
        <span className="page-count">{playlist.trackCount}</span>
      </header>
      <div className="track-scroll">
        <ol className="track-list">
          {page.songs.map((song, index) => (
            <li key={`${song.id}-${index}`}>
              <button
                type="button"
                className={`track-row ${song.id === currentId ? 'is-current' : ''}`}
                onClick={() => onPlay(page.songs, index)}
              >
                <span className="track-index">{index + 1}</span>
                <span className="track-main">
                  <span className="track-title">{song.title}</span>
                  <span className="track-artist">{song.artistText}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div ref={sentinel} className="track-foot">
          {page.status === 'loading' ? (
            <Spinner />
          ) : page.status === 'error' ? (
            <button
              type="button"
              className="qr-retry"
              onClick={() => void loadMore(page.songs.length)}
              aria-label="重试"
            >
              <RotateCw size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : page.done && !page.songs.length ? (
            <span className="empty-glyph" aria-hidden="true">
              <Music2 size={24} strokeWidth={1.6} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NowPlaying({ onLyrics }: { onLyrics: () => void }) {
  const song = usePlayerStore((store) => store.song);
  const playing = usePlayerStore((store) => store.playing);
  const currentTime = usePlayerStore((store) => store.currentTime);
  const duration = usePlayerStore((store) => store.duration);
  const playInfo = usePlayerStore((store) => store.playInfo);
  if (!song) return null;
  const unavailable = playInfo ? !playInfo.available : false;
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="now">
      <div className="now-progress">
        <span style={{ width: `${percent}%` }} />
      </div>
      <button type="button" className="now-main" onClick={onLyrics} aria-label="歌词">
        {song.cover ? (
          <img className="now-cover" src={coverUrl(song.cover, 96)} alt="" referrerPolicy="no-referrer" />
        ) : null}
        <span className="now-text">
          <span className="now-title">{song.title}</span>
          <span className="now-artist">{unavailable ? playInfo?.reason : song.artistText}</span>
        </span>
      </button>
      <button type="button" className="icon-action" onClick={() => void player.previous()} aria-label="上一首">
        <SkipBack size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-action now-toggle"
        onClick={() => void player.toggle()}
        aria-label={playing ? '暂停' : '播放'}
      >
        {playing ? (
          <Pause size={20} strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <Play size={20} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
      <button type="button" className="icon-action" onClick={() => void player.next()} aria-label="下一首">
        <SkipForward size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}

function LyricView({ onClose }: { onClose: () => void }) {
  const song = usePlayerStore((store) => store.song);
  const lines = usePlayerStore((store) => store.lines);
  const loading = usePlayerStore((store) => store.loadingSong);
  const currentTime = usePlayerStore((store) => store.currentTime);
  const active = currentLineIndex(lines, currentTime);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current
      ?.querySelector('.lyric-line.is-active')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);

  return (
    <div className="lyric-view">
      <header className="page-head">
        <button type="button" className="icon-action" onClick={onClose} aria-label="收起歌词">
          <ChevronDown size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <span className="page-title">{song?.title}</span>
      </header>
      <div className="lyric-scroll" ref={scroller}>
        {lines.length ? (
          lines.map((line, index) => (
            <button
              type="button"
              key={line.key}
              className={`lyric-line ${index === active ? 'is-active' : index < active ? 'is-past' : ''}`}
              onClick={() => void player.seekTo(line.time)}
            >
              {line.text}
              {line.translation ? <span>{line.translation}</span> : null}
            </button>
          ))
        ) : (
          <div className="world-state">{loading ? <Spinner /> : <Music2 size={24} strokeWidth={1.6} aria-hidden="true" />}</div>
        )}
      </div>
    </div>
  );
}
