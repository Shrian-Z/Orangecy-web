import { AnimatePresence, motion } from 'motion/react';
import { ListMusic, Music2, Play, Search, X } from 'lucide-react';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import type { Song } from '@/types';
import { formatTime } from '@/lib/lrc';

const PLATFORM_LABEL: Record<string, string> = {
  netease: '网易云',
  qq: 'QQ',
  kugou: '酷狗',
  bodian: '波点',
};

function rowKey(song: Song, index: number) {
  return `${song.platform}:${song.id}:${index}`;
}

export function QueueDrawer() {
  const open = usePlayerStore((state) => state.drawer === 'queue');
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const openDrawer = usePlayerStore((state) => state.openDrawer);
  const close = () => openDrawer(null);

  const play = (index: number) => {
    void player.playFromList(queue, index);
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
            transition={{ duration: 0.2 }}
            onClick={close}
          />
          <motion.aside
            className="search-drawer queue-drawer"
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            role="dialog"
            aria-label="播放队列"
          >
            <header className="drawer-head">
              <div>
                <p className="drawer-kicker">UP NEXT</p>
                <h2>播放列表</h2>
              </div>
              <button type="button" className="icon-button" onClick={close} aria-label="关闭">
                <X size={17} />
              </button>
            </header>

            {queue.length ? (
              <>
                <div className="queue-summary">
                  <span className="status-dot is-live" />
                  共 {queue.length} 首 · 当前 {queueIndex + 1}/{queue.length}
                  <em>{queue.filter((song) => song.platform && song.platform !== 'netease').length} 首来自其他平台</em>
                </div>
                <div className="queue-list">
                  {queue.map((song, index) => {
                    const active = index === queueIndex;
                    return (
                      <button
                        type="button"
                        className={`queue-row ${active ? 'is-active' : ''}`}
                        key={rowKey(song, index)}
                        onClick={() => play(index)}
                        title={`播放 ${song.title}`}
                      >
                        <span className="queue-index">{active ? <Play size={11} fill="currentColor" /> : String(index + 1).padStart(2, '0')}</span>
                        <span className="queue-cover">
                          {song.cover ? <img src={song.cover} alt="" loading="lazy" /> : <Music2 size={16} />}
                        </span>
                        <span className="queue-copy">
                          <strong>{song.title}</strong>
                          <small>
                            {song.artistText}
                            <em className={`queue-platform is-${song.platform ?? 'netease'}`}>
                              {PLATFORM_LABEL[song.platform ?? 'netease'] ?? '网易云'}
                            </em>
                          </small>
                        </span>
                        <span className="queue-time">{formatTime(song.durationMs / 1000)}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="queue-empty">
                <ListMusic size={24} />
                <h3>队列还是空的</h3>
                <p>从搜索或推荐里点一首歌，这里会显示接下来的顺序。</p>
                <button type="button" className="login-button" onClick={() => openDrawer('search')}>
                  <Search size={14} />
                  去找歌
                </button>
              </div>
            )}

            <footer className="drawer-foot">
              <span className="status-dot is-live" />
              原曲直接播 · 不切片
              <em>点任意一首切换</em>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
