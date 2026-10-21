import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Loader2,
  LogIn,
  Music2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { api } from '@/api';
import type { CatalogStatus, Recommendation } from '@/api';
import type { Song } from '@/types';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { useStudyStore } from '@/studyStore';
import { getStudyTargets } from '@/lib/srs';
import { buildSongMatches } from '@/lib/wordbook';
import { formatTime } from '@/lib/lrc';

type Status = 'idle' | 'loading' | 'building' | 'ready' | 'error';

const PLATFORM_LABEL: Record<string, string> = {
  netease: '网易云',
  qq: 'QQ',
  kugou: '酷狗',
  bodian: '波点',
};

async function canPlay(song: Song) {
  if (song.platform === 'qq') return (await api.qq.play(song.id)).available;
  if (song.platform === 'kugou') return (await api.kugou.play(song)).available;
  if (song.platform === 'bodian') return (await api.bodian.play(song)).available;
  return (await api.play(song.id)).available;
}

export function RecommendView() {
  const wordbook = usePlayerStore((state) => state.wordbook);
  const lines = usePlayerStore((state) => state.lines);
  const currentSong = usePlayerStore((state) => state.song);
  const setView = usePlayerStore((state) => state.setView);
  const openDrawer = usePlayerStore((state) => state.openDrawer);
  const study = useStudyStore((state) => state.state);
  const counts = useStudyStore((state) => state.counts);

  const targets = useMemo(() => getStudyTargets(study), [study]);
  const fallback = useMemo(
    () => (wordbook && lines.length ? [...buildSongMatches(lines, wordbook).words.keys()].slice(0, 12) : []),
    [wordbook, lines],
  );
  const effectiveWords = targets.length ? targets : fallback;
  const wordsKey = effectiveWords.join('|');

  const [status, setStatus] = useState<Status>('idle');
  const [songs, setSongs] = useState<Recommendation[]>([]);
  const [catalog, setCatalog] = useState<CatalogStatus | null>(null);
  const [filteredOut, setFilteredOut] = useState(0);
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!effectiveWords.length) {
      setStatus('idle');
      setSongs([]);
      setFilteredOut(0);
      return;
    }

    let cancelled = false;
    setStatus((previous) => (previous === 'ready' ? 'loading' : previous === 'building' ? 'building' : 'loading'));
    setError(null);

    const load = async () => {
      try {
        // 多要一些，过滤掉账号放不了的歌后再取前 10 首
        const result = await api.recommend(effectiveWords, 20);
        if (cancelled) return;
        setCatalog(result.catalog);
        if (result.status === 'building') {
          setSongs([]);
          setFilteredOut(0);
          setStatus('building');
          timerRef.current = window.setTimeout(load, 2200);
          return;
        }

        setStatus('loading');
        const checked = await Promise.all(
          result.songs.map(async (item) => {
            try {
              return { item, playable: await canPlay(item.song) };
            } catch {
              // 探测失败不误伤推荐，继续保留
              return { item, playable: true };
            }
          }),
        );
        if (cancelled) return;
        const playable = checked.filter((entry) => entry.playable).map((entry) => entry.item);
        setSongs(playable.slice(0, 10));
        setFilteredOut(checked.length - playable.length);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '推荐没加载出来');
        setStatus('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // effectiveWords 由 wordsKey 代表；用 key 避免数组引用变化重拉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordsKey, nonce]);

  const visibleSongs = useMemo(
    () =>
      platformFilter === 'all'
        ? songs
        : songs.filter((item) => (item.song.platform ?? 'netease') === platformFilter),
    [songs, platformFilter],
  );
  const platforms = useMemo(
    () => [...new Set(songs.map((item) => item.song.platform ?? 'netease'))],
    [songs],
  );

  useEffect(() => {
    if (platformFilter !== 'all' && !platforms.includes(platformFilter)) {
      setPlatformFilter('all');
    }
  }, [platforms, platformFilter]);

  const play = (index: number) => {
    const list = visibleSongs.map((item) => item.song);
    void player.playFromList(list, index);
    setView('player');
  };

  const hasPersonal = targets.length > 0;

  return (
    <main className="recommend-stage">
      <header className="recommend-head">
        <div className="recommend-head-copy">
          <p className="kicker">
            <span className="kicker-dot" />
            FOR YOU · TODAY
          </p>
          <h1>
            今天听这十首，
            <br />
            {counts.due > 0 ? '把到期词还上。' : counts.newWords > 0 ? '把新词听熟。' : '用歌把词焐热。'}
          </h1>
          <p className="recommend-lede">
            {hasPersonal
              ? `按 ts-fsrs 的到期词 + 今日新词排序，只在有限的英文歌池里挑，覆盖越多越靠前。`
              : `今天还没有到期词，先用《${currentSong?.title ?? '正在听的歌'}》里的词热身。`}
          </p>
        </div>
        <div className="recommend-stats">
          <span>
            <strong>{counts.due}</strong>
            到期
          </span>
          <span>
            <strong>{counts.newWords}</strong>
            新词
          </span>
          <span>
            <strong>{counts.learned}</strong>
            已学
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setNonce((value) => value + 1)}
            title="刷新推荐"
            aria-label="刷新推荐"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {status === 'building' || status === 'loading' ? (
          <motion.section
            className="recommend-building"
            key="building"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="recommend-building-icon">
              <Loader2 className="spin" size={22} />
            </div>
            <div>
              <strong>
                {status === 'building'
                  ? `正在建推荐池 ${catalog?.progress ?? 0}/${catalog?.total ?? 20}`
                  : '正在算今天的十首'}
              </strong>
              <p>
                {status === 'building' && catalog?.current
                  ? `正在处理：${catalog.current}`
                  : '首次使用会拉取少量歌词做整词索引，不下载、不切片音频，约 1 分钟。'}
              </p>
              <span className="recommend-progress">
                <i
                  style={{
                    width: `${catalog?.total ? Math.min(100, (catalog.progress / catalog.total) * 100) : 6}%`,
                  }}
                />
              </span>
            </div>
          </motion.section>
        ) : status === 'error' ? (
          <motion.section
            className="recommend-error"
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AlertCircle size={20} />
            <div>
              <strong>推荐池没建起来</strong>
              <p>{error ?? '检查网络后再试一次'}</p>
            </div>
            <button type="button" className="ghost-button" onClick={() => setNonce((value) => value + 1)}>
              <RefreshCw size={14} />
              重试
            </button>
          </motion.section>
        ) : status === 'ready' && songs.length ? (
          <motion.div
            className="recommend-body"
            key="ready"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="rec-filters" role="group" aria-label="按平台筛选推荐">
              <button
                type="button"
                className={`rec-filter ${platformFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setPlatformFilter('all')}
              >
                全部
                <em>{songs.length}</em>
              </button>
              {platforms.map((platform) => (
                <button
                  type="button"
                  className={`rec-filter is-${platform} ${platformFilter === platform ? 'is-active' : ''}`}
                  key={platform}
                  onClick={() => setPlatformFilter(platform)}
                >
                  {PLATFORM_LABEL[platform] ?? platform}
                  <em>{songs.filter((item) => (item.song.platform ?? 'netease') === platform).length}</em>
                </button>
              ))}
            </div>
            <div className="recommend-grid">
              {visibleSongs.map((item, index) => (
                <button
                  type="button"
                  className="rec-card"
                  key={`${item.song.platform}:${item.song.id}`}
                  onClick={() => play(index)}
                  title={`播放 ${item.song.title}`}
                >
                  <span className="rec-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="rec-cover">
                    {item.song.cover ? (
                      <img src={item.song.cover} alt="" loading="lazy" />
                    ) : (
                      <Music2 size={18} />
                    )}
                  </span>
                  <span className="rec-main">
                    <strong>{item.song.title}</strong>
                    <small>
                      {item.song.artistText}
                      <em className={`rec-platform is-${item.song.platform ?? 'netease'}`}>
                        {PLATFORM_LABEL[item.song.platform ?? 'netease'] ?? '网易云'}
                      </em>
                    </small>
                    <span className="rec-words">
                      {item.coverage.slice(0, 4).map((word) => (
                        <em key={word.word} title={`${formatTime(word.time)} · ${word.lineText}`}>
                          {word.word}
                        </em>
                      ))}
                      {item.coverage.length > 4 ? <em>+{item.coverage.length - 4}</em> : null}
                    </span>
                  </span>
                  <span className="rec-score">
                    <strong>{item.score}</strong>
                    <small>词覆盖</small>
                  </span>
                  <span className="rec-play">
                    <Play size={15} fill="currentColor" />
                  </span>
                </button>
              ))}
            </div>
            <p className="recommend-foot">
              从有限歌池里选，不扫全曲库 · 覆盖词来自歌词整词匹配 · 点一首从 0:00 开始播
              {filteredOut ? ` · 已过滤 ${filteredOut} 首当前账号放不了的歌` : ''}
              {platformFilter !== 'all' ? ` · 当前只看 ${PLATFORM_LABEL[platformFilter] ?? platformFilter}` : ''}
            </p>
          </motion.div>
        ) : status === 'ready' ? (
          <motion.section
            className="recommend-empty"
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Sparkles size={24} />
            <h2>{filteredOut ? '这批歌当前账号都放不了' : '这个歌池没盖住这些词'}</h2>
            <p>
              {filteredOut
                ? '登录对应平台，或换一首歌让推荐池重新找。'
                : '换一首歌，或先把今天的新词过一遍。'}
            </p>
            <div className="cards-empty-actions">
              {filteredOut ? (
                <button type="button" className="login-button" onClick={() => openDrawer('platforms')}>
                  <LogIn size={14} />
                  登录平台账号
                </button>
              ) : (
                <button type="button" className="login-button" onClick={() => openDrawer('search')}>
                  <Search size={14} />
                  换一首歌
                </button>
              )}
              <button type="button" className="ghost-button" onClick={() => setView('cards')}>
                去学新词
              </button>
            </div>
          </motion.section>
        ) : (
          <motion.section
            className="recommend-empty"
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <BookOpen size={24} />
            <h2>先有词，再有推荐</h2>
            <p>选一本词书、听一首英文歌，推荐池才知道该找哪些词。</p>
            <div className="cards-empty-actions">
              <button type="button" className="login-button" onClick={() => setView('cards')}>
                去学新词
              </button>
              <button type="button" className="ghost-button" onClick={() => setView('player')}>
                <ArrowRight size={14} />
                回到播放器
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
