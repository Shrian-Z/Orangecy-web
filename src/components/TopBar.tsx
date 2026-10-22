import { Compass, Layers, LogIn, Play, RotateCcw, Search } from 'lucide-react';
import { usePlayerStore } from '@/store';
import type { AppView } from '@/store';
import { useStudyStore } from '@/studyStore';

const NAV: { view: AppView; label: string; Icon: typeof Play }[] = [
  { view: 'player', label: '播放', Icon: Play },
  { view: 'recommend', label: '推荐', Icon: Compass },
  { view: 'cards', label: '词卡', Icon: Layers },
  { view: 'review', label: '复习', Icon: RotateCcw },
];

export function TopBar() {
  const auth = usePlayerStore((state) => state.auth);
  const qqAuth = usePlayerStore((state) => state.qqAuth);
  const kugouAuth = usePlayerStore((state) => state.kugouAuth);
  const bodianAuth = usePlayerStore((state) => state.bodianAuth);
  const song = usePlayerStore((state) => state.song);
  const openDrawer = usePlayerStore((state) => state.openDrawer);
  const view = usePlayerStore((state) => state.view);
  const setView = usePlayerStore((state) => state.setView);
  const due = useStudyStore((state) => state.counts.due);

  const isQQ = song?.platform === 'qq';
  const isKugou = song?.platform === 'kugou';
  const isBodian = song?.platform === 'bodian';
  const activeAuth = isQQ ? qqAuth : isKugou ? kugouAuth : isBodian ? bodianAuth : auth;
  const activeProfile = activeAuth?.profile;
  const platformLabel = isQQ
    ? 'QQ音乐'
    : isKugou
      ? '酷狗音乐'
      : isBodian
        ? '波点音乐'
        : '网易云音乐';

  return (
    <header className="topbar">
      <button
        type="button"
        className="brand"
        onClick={() => setView('player')}
        aria-label="Orangecy，回到播放器"
        title="回到播放器"
      >
        <span className="brand-orbit" aria-hidden="true">
          <span className="brand-dot" />
        </span>
        <span className="brand-text">
          <strong>Orangecy</strong>
        </span>
      </button>

      <nav className="nav" aria-label="主导航">
        {NAV.map(({ view: target, label, Icon }) => {
          const active = view === target;
          const badge = target === 'review' && due > 0;
          return (
            <button
              key={target}
              type="button"
              className={`nav-item ${active ? 'is-active' : ''}`}
              onClick={() => setView(target)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              title={badge ? `${label} · ${due} 个到期` : label}
            >
              <Icon size={17} strokeWidth={1.8} />
              {badge ? <span className="nav-due" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </nav>

      <div className="topbar-right">
        <button
          type="button"
          className="icon-button search-trigger"
          onClick={() => openDrawer('search')}
          aria-label="搜索歌曲"
          title="搜索歌曲（⌘K）"
        >
          <Search size={17} strokeWidth={1.8} />
        </button>

        <button
          type="button"
          className={`account-trigger platform-trigger ${activeProfile ? 'has-avatar' : ''}`}
          onClick={() => openDrawer('platforms')}
          aria-label={activeProfile ? `${platformLabel} · ${activeProfile.nickname}` : '登录 / 平台账号'}
          title={activeProfile ? `${platformLabel} · ${activeProfile.nickname}` : `登录${platformLabel}`}
        >
          {activeProfile ? (
            activeProfile.avatarUrl ? (
              <img src={activeProfile.avatarUrl} alt="" />
            ) : (
              <span>{activeProfile.nickname.slice(0, 1)}</span>
            )
          ) : (
            <LogIn size={17} strokeWidth={1.8} />
          )}
        </button>
      </div>
    </header>
  );
}
