import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Loader2, LogIn, Music2, Search, X } from 'lucide-react';
import { api } from '@/api';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { formatTime } from '@/lib/lrc';
import type { Song } from '@/types';

const SUGGESTIONS = ['起风了', '晴天', 'Counting Stars', 'Viva La Vida', '夜空中最亮的星'];
const RECENT_KEY = 'orangecy.recent';

function loadRecent(): Song[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function feeLabel(fee: number) {
  if (fee === 1) return 'VIP';
  if (fee === 4) return '付费';
  return null;
}

type SearchPlatform = 'all' | 'netease' | 'qq' | 'kugou' | 'bodian';

export function SearchDrawer() {
  const open = usePlayerStore((state) => state.drawer === 'search');
  const close = () => usePlayerStore.getState().openDrawer(null);
  const qqAuth = usePlayerStore((state) => state.qqAuth);
  const kugouAuth = usePlayerStore((state) => state.kugouAuth);
  const bodianAuth = usePlayerStore((state) => state.bodianAuth);
  const auth = usePlayerStore((state) => state.auth);
  const openDrawer = usePlayerStore((state) => state.openDrawer);
  const setQQAuth = usePlayerStore((state) => state.setQQAuth);
  const [platform, setPlatform] = useState<SearchPlatform>('all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [recent, setRecent] = useState<Song[]>(loadRecent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (platform === 'qq' && !qqAuth) {
      void api.qq
        .authStatus()
        .then(setQQAuth)
        .catch(() => {
          // QQ sidecar 没起来时保留未登录状态
        });
    }
  }, [open, platform, qqAuth, setQQAuth]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        let songs;
        if (platform === 'all') {
          const settled = await Promise.allSettled([
            api.search(q),
            api.qq.search(q),
            api.kugou.search(q),
            api.bodian.search(q),
          ]);
          const lists = settled
            .filter((item): item is PromiseFulfilledResult<{ songs: Song[] }> => item.status === 'fulfilled')
            .map((item) => item.value.songs)
            .filter((list) => list.length);
          if (!lists.length) throw new Error('四个平台这次都没搜到，稍后再试');
          const merged: Song[] = [];
          const seen = new Set<string>();
          for (let offset = 0; merged.length < 30; offset += 1) {
            let added = false;
            for (const list of lists) {
              const song = list[offset];
              if (!song) continue;
              added = true;
              const key = `${song.platform}:${song.id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              merged.push(song);
              if (merged.length >= 30) break;
            }
            if (!added) break;
          }
          songs = merged;
        } else if (platform === 'qq') {
          songs = (await api.qq.search(q)).songs;
        } else if (platform === 'kugou') {
          songs = (await api.kugou.search(q)).songs;
        } else if (platform === 'bodian') {
          songs = (await api.bodian.search(q)).songs;
        } else {
          songs = (await api.search(q)).songs;
        }
        if (id !== requestId.current) return;
        setResults(songs);
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : '搜索失败');
        setResults([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 360);
    return () => window.clearTimeout(timer);
  }, [query, open, platform]);

  const remember = (song: Song) => {
    const next = [
      song,
      ...recent.filter((item) => !(item.id === song.id && item.platform === song.platform)),
    ].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // 忽略存储失败
    }
  };

  const pick = (list: Song[], index: number) => {
    const song = list[index];
    if (!song) return;
    remember(song);
    void player.playFromList(list, index);
    close();
  };

  const body = useMemo(() => {
    if (error) {
      return (
        <div className="search-empty">
          <span className="search-empty-icon">!</span>
          <p>{error}</p>
          <span>检查网络后再试一次。</span>
        </div>
      );
    }
    if (loading) {
      return (
        <div className="result-list">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div className="result-skeleton" key={index}>
              <span className="skeleton-cover" />
              <span className="skeleton-lines">
                <i style={{ width: `${46 + ((index * 13) % 35)}%` }} />
                <i style={{ width: `${28 + ((index * 9) % 28)}%` }} />
              </span>
            </div>
          ))}
        </div>
      );
    }
    if (!query.trim()) {
      return (
        <div className="search-idle">
          {recent.length ? (
            <>
              <p className="search-section-label">最近播放</p>
              <div className="recent-grid">
                {recent.map((song, index) => (
                  <button
                    type="button"
                    className="recent-card"
                    key={`${song.platform}:${song.id}`}
                    onClick={() => pick(recent, index)}
                  >
                    <span className="recent-cover">
                      {song.cover ? <img src={song.cover} alt="" /> : <Music2 size={18} />}
                    </span>
                    <span>
                      <strong>
                        {song.title}
                        <em className={`platform-mini is-${song.platform ?? 'netease'}`}>
                          {song.platform === 'qq'
                            ? 'QQ'
                            : song.platform === 'kugou'
                              ? '酷狗'
                              : song.platform === 'bodian'
                                ? '波点'
                                : '网易云'}
                        </em>
                      </strong>
                      <small>{song.artistText}</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <p className="search-section-label">试试这些</p>
          <div className="suggestion-list">
            {SUGGESTIONS.map((item) => (
              <button type="button" key={item} className="suggestion" onClick={() => setQuery(item)}>
                <Search size={14} strokeWidth={1.8} />
                {item}
                <ArrowRight size={13} strokeWidth={1.7} />
              </button>
            ))}
          </div>
          <p className="search-note">
            搜索来自
            {platform === 'qq'
              ? 'QQ 音乐'
              : platform === 'kugou'
                ? '酷狗音乐'
                : platform === 'bodian'
                  ? '波点音乐'
                  : '网易云音乐'}
            的非官方接口，未做任何切片或下载；
            {platform === 'qq' && !qqAuth?.loggedIn
              ? 'QQ 免费曲可直接播；会员曲需要先扫码登录。'
              : platform === 'kugou'
                ? '免费曲可直接播；会员曲登录酷狗后尝试播放。'
                : platform === 'bodian'
                  ? '波点播放需要登录，且仅限中国大陆网络。'
                  : '实际能不能播取决于你的账号权限。'}
          </p>
        </div>
      );
    }
    if (!results.length) {
      return (
        <div className="search-empty">
          <span className="search-empty-icon">
            <Search size={20} />
          </span>
          <p>没有找到「{query.trim()}」</p>
          <span>换个歌名或歌手试试。</span>
        </div>
      );
    }
    return (
      <div className="result-list">
        {results.map((song, index) => (
          <button
            type="button"
            className="result-row"
            key={`${song.platform}:${song.id}`}
            onClick={() => pick(results, index)}
          >
            <span className="result-cover">
              {song.cover ? <img src={song.cover} alt="" loading="lazy" /> : <Music2 size={18} />}
            </span>
            <span className="result-meta">
              <span className="result-title">
                {song.title}
                {feeLabel(song.fee) ? <em className={`fee-tag ${song.fee === 1 ? 'is-vip' : ''}`}>{feeLabel(song.fee)}</em> : null}
              </span>
              <span className="result-sub">
                {song.artistText}
                {song.album ? <i> · {song.album}</i> : null}
                <em className={`platform-mini is-${song.platform ?? 'netease'}`}>
                  {song.platform === 'qq'
                    ? 'QQ'
                    : song.platform === 'kugou'
                      ? '酷狗'
                      : song.platform === 'bodian'
                        ? '波点'
                        : '网易云'}
                </em>
              </span>
            </span>
            <span className="result-duration">{formatTime(song.durationMs / 1000)}</span>
            <span className="result-play">
              <ArrowRight size={15} strokeWidth={1.8} />
            </span>
          </button>
        ))}
      </div>
    );
  }, [error, loading, query, recent, results, platform, qqAuth]);

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
            className="search-drawer"
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            role="dialog"
            aria-label="搜索歌曲"
          >
            <header className="drawer-head">
              <div>
                <p className="drawer-kicker">ADD A SONG</p>
                <h2>选一首歌</h2>
              </div>
              <button type="button" className="icon-button" onClick={close} aria-label="关闭">
                <X size={18} />
              </button>
            </header>

            <div className="platform-tabs" role="tablist" aria-label="选择音源平台">
              <button
                type="button"
                role="tab"
                aria-selected={platform === 'all'}
                className={`platform-tab ${platform === 'all' ? 'is-active' : ''}`}
                onClick={() => {
                  if (platform === 'all') return;
                  setPlatform('all');
                  setResults([]);
                  setError(null);
                  setLoading(false);
                }}
              >
                全平台
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={platform === 'netease'}
                className={`platform-tab ${platform === 'netease' ? 'is-active' : ''}`}
                onClick={() => {
                  if (platform === 'netease') return;
                  setPlatform('netease');
                  setResults([]);
                  setError(null);
                  setLoading(false);
                }}
              >
                网易云音乐
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={platform === 'qq'}
                className={`platform-tab ${platform === 'qq' ? 'is-active' : ''}`}
                onClick={() => {
                  if (platform === 'qq') return;
                  setPlatform('qq');
                  setResults([]);
                  setError(null);
                  setLoading(false);
                }}
              >
                QQ 音乐
                {qqAuth?.loggedIn ? <i className="platform-on" /> : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={platform === 'kugou'}
                className={`platform-tab ${platform === 'kugou' ? 'is-active' : ''}`}
                onClick={() => {
                  if (platform === 'kugou') return;
                  setPlatform('kugou');
                  setResults([]);
                  setError(null);
                  setLoading(false);
                }}
              >
                酷狗音乐
                {kugouAuth?.loggedIn ? <i className="platform-on" /> : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={platform === 'bodian'}
                className={`platform-tab ${platform === 'bodian' ? 'is-active' : ''}`}
                onClick={() => {
                  if (platform === 'bodian') return;
                  setPlatform('bodian');
                  setResults([]);
                  setError(null);
                  setLoading(false);
                }}
              >
                波点音乐
                {bodianAuth?.loggedIn ? <i className="platform-on" /> : null}
              </button>
            </div>

            {platform === 'bodian' ? (
              <div className={`qq-account is-kugou ${bodianAuth?.loggedIn ? 'is-on' : ''}`}>
                {bodianAuth?.loggedIn && bodianAuth.profile ? (
                  <>
                    <span className="qq-avatar">
                      {bodianAuth.profile.avatarUrl ? (
                        <img src={bodianAuth.profile.avatarUrl} alt="" />
                      ) : (
                        bodianAuth.profile.nickname.slice(0, 1)
                      )}
                    </span>
                    <span className="qq-account-text">
                      <strong>{bodianAuth.profile.nickname}</strong>
                      <small>波点音乐已连接 · 播放仅限中国大陆网络</small>
                    </span>
                    <span className="qq-ok">已连接</span>
                  </>
                ) : (
                  <>
                    <span className="qq-account-text">
                      <strong>波点音乐未登录</strong>
                      <small>波点播放需要登录，且仅限中国大陆网络。</small>
                    </span>
                    <button
                      type="button"
                      className="mini-button warm"
                      onClick={() => openDrawer('bodian-login')}
                    >
                      <LogIn size={13} />
                      扫码登录
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {platform === 'kugou' ? (
              <div className={`qq-account is-kugou ${kugouAuth?.loggedIn ? 'is-on' : ''}`}>
                {kugouAuth?.loggedIn && kugouAuth.profile ? (
                  <>
                    <span className="qq-avatar">
                      {kugouAuth.profile.avatarUrl ? (
                        <img src={kugouAuth.profile.avatarUrl} alt="" />
                      ) : (
                        kugouAuth.profile.nickname.slice(0, 1)
                      )}
                    </span>
                    <span className="qq-account-text">
                      <strong>{kugouAuth.profile.nickname}</strong>
                      <small>酷狗音乐已连接 · 会员曲会尝试用你的账号播放</small>
                    </span>
                    <span className="qq-ok">已连接</span>
                  </>
                ) : (
                  <>
                    <span className="qq-account-text">
                      <strong>酷狗音乐未登录</strong>
                      <small>免费曲可以直接播；登录酷狗后可尝试会员曲。</small>
                    </span>
                    <button
                      type="button"
                      className="mini-button warm"
                      onClick={() => openDrawer('kugou-login')}
                    >
                      <LogIn size={13} />
                      扫码登录
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {platform === 'qq' ? (
              <div className={`qq-account ${qqAuth?.loggedIn ? 'is-on' : ''}`}>
                {qqAuth?.loggedIn && qqAuth.profile ? (
                  <>
                    <span className="qq-avatar">
                      {qqAuth.profile.avatarUrl ? (
                        <img src={qqAuth.profile.avatarUrl} alt="" />
                      ) : (
                        qqAuth.profile.nickname.slice(0, 1)
                      )}
                    </span>
                    <span className="qq-account-text">
                      <strong>{qqAuth.profile.nickname}</strong>
                      <small>QQ 音乐已连接 · 会员曲可尝试播放</small>
                    </span>
                    <span className="qq-ok">已连接</span>
                  </>
                ) : (
                  <>
                    <span className="qq-account-text">
                      <strong>QQ 音乐未登录</strong>
                      <small>免费曲可以直接播；会员曲要先扫码登录才有播放地址。</small>
                    </span>
                    <button type="button" className="mini-button warm" onClick={() => openDrawer('qq-login')}>
                      <LogIn size={13} />
                      扫码登录
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <div className="search-box">
              <Search size={18} strokeWidth={1.8} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && results[0]) pick(results, 0);
                  if (event.key === 'Escape') close();
                }}
                placeholder="歌名、歌手，比如「起风了」"
                aria-label="搜索歌曲"
              />
              {loading ? <Loader2 className="spin" size={16} /> : null}
              {query ? (
                <button type="button" className="clear-query" onClick={() => setQuery('')} aria-label="清空">
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div className="search-body">{body}</div>

            <footer className="drawer-foot">
              <span
                className={`status-dot ${
                  platform === 'qq'
                    ? qqAuth?.loggedIn
                      ? 'is-live'
                      : ''
                    : platform === 'kugou'
                      ? kugouAuth?.loggedIn
                        ? 'is-live'
                        : ''
                      : platform === 'bodian'
                        ? bodianAuth?.loggedIn
                          ? 'is-live'
                          : ''
                        : auth?.loggedIn
                          ? 'is-live'
                          : ''
                }`}
              />
              {platform === 'all'
                ? '四平台 · 并行搜索'
                : platform === 'qq'
                  ? 'QQ 音乐 · 社区接口'
                  : platform === 'kugou'
                    ? '酷狗音乐 · 社区接口'
                    : platform === 'bodian'
                      ? '波点音乐 · 独立重写'
                      : '网易云音乐 · 非官方接口'}
              <em>
                {platform === 'all'
                  ? '自动混合'
                  : platform === 'qq'
                    ? qqAuth?.loggedIn
                      ? '登录态只存本机'
                      : '会员曲需登录'
                    : platform === 'kugou'
                      ? kugouAuth?.loggedIn
                        ? '登录态只存本机'
                        : '会员曲需登录'
                      : platform === 'bodian'
                        ? bodianAuth?.loggedIn
                          ? '仅限中国大陆网络'
                          : '播放需登录'
                        : '登录后可播更多'}
              </em>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
