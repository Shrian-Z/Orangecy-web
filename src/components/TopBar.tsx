import { BookOpen, Brain, Check, CircleDashed, Layers, LogIn, Search, ShieldCheck } from 'lucide-react';
import { usePlayerStore } from '@/store';
import { currentLineIndex } from '@/store';
import { useStudyStore } from '@/studyStore';

export function TopBar() {
  const auth = usePlayerStore((state) => state.auth);
  const qqAuth = usePlayerStore((state) => state.qqAuth);
  const kugouAuth = usePlayerStore((state) => state.kugouAuth);
  const bodianAuth = usePlayerStore((state) => state.bodianAuth);
  const song = usePlayerStore((state) => state.song);
  const lines = usePlayerStore((state) => state.lines);
  const seekCheck = usePlayerStore((state) => state.seekCheck);
  const openDrawer = usePlayerStore((state) => state.openDrawer);
  const view = usePlayerStore((state) => state.view);
  const setView = usePlayerStore((state) => state.setView);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const due = useStudyStore((state) => state.counts.due);
  const active = currentLineIndex(lines, currentTime);

  const checks = [Boolean(auth?.loggedIn), lines.length > 0, Boolean(seekCheck?.passed)];
  const passed = checks.filter(Boolean).length;
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
          <small>听歌，把词记住</small>
        </span>
      </button>

      <nav className="nav" aria-label="主导航">
        <button
          type="button"
          className={`nav-item ${view === 'player' ? 'is-active' : ''}`}
          onClick={() => setView('player')}
        >
          播放
          {view === 'player' ? <span className="nav-live" aria-hidden="true" /> : null}
        </button>
        <button
          type="button"
          className={`nav-item ${view === 'recommend' ? 'is-active' : ''}`}
          onClick={() => setView('recommend')}
        >
          推荐
          {view === 'recommend' ? <span className="nav-live" aria-hidden="true" /> : null}
        </button>
        <button
          type="button"
          className={`nav-item ${view === 'cards' ? 'is-active' : ''}`}
          onClick={() => setView('cards')}
        >
          词卡
          {view === 'cards' ? <span className="nav-live" aria-hidden="true" /> : null}
        </button>
        <button
          type="button"
          className={`nav-item ${view === 'review' ? 'is-active' : ''}`}
          onClick={() => setView('review')}
        >
          复习
          {view === 'review' ? (
            <span className="nav-live" aria-hidden="true" />
          ) : due > 0 ? (
            <span className="nav-badge">{due}</span>
          ) : null}
        </button>
      </nav>

      <div className="topbar-right">
        <button
          type="button"
          className="platform-chip platform-chip-button"
          title="平台账号"
          aria-label={`平台账号：${platformLabel}`}
          onClick={() => openDrawer('platforms')}
        >
          <span className={`status-dot ${activeAuth?.loggedIn ? 'is-live' : ''}`} />
          {platformLabel}
        </button>

        <button
          type="button"
          className={`check-chip ${passed === 3 ? 'is-complete' : ''}`}
          onClick={() => openDrawer('check')}
        >
          <ShieldCheck size={15} strokeWidth={1.8} />
          接入检查 {passed}/3
        </button>

        <button
          type="button"
          className={`icon-button cards-trigger ${view === 'cards' ? 'is-on' : ''}`}
          onClick={() => setView('cards')}
          aria-label="打开词卡"
          title="词卡"
        >
          <BookOpen size={18} strokeWidth={1.8} />
        </button>

        <button
          type="button"
          className={`icon-button review-trigger ${view === 'review' ? 'is-on' : ''}`}
          onClick={() => setView('review')}
          aria-label="打开复习"
          title={due > 0 ? `复习 · ${due} 个到期` : '复习'}
        >
          <Brain size={18} strokeWidth={1.8} />
          {due > 0 ? <span className="icon-badge">{due > 99 ? '99+' : due}</span> : null}
        </button>

        <button
          type="button"
          className="icon-button platform-trigger"
          onClick={() => openDrawer('platforms')}
          aria-label="平台账号"
          title="平台账号"
        >
          <Layers size={18} strokeWidth={1.8} />
        </button>

        <button type="button" className="icon-button search-trigger" onClick={() => openDrawer('search')} aria-label="搜索歌曲" title="搜索歌曲（⌘K）">
          <Search size={18} strokeWidth={1.8} />
        </button>

        {activeAuth?.loggedIn && activeProfile ? (
          <button
            type="button"
            className="avatar"
            onClick={() =>
              openDrawer(
                isQQ ? 'qq-login' : isKugou ? 'kugou-login' : isBodian ? 'bodian-login' : 'check',
              )
            }
            title={activeProfile.nickname}
            aria-label={`已登录 ${activeProfile.nickname}`}
          >
            {activeProfile.avatarUrl ? (
              <img src={activeProfile.avatarUrl} alt="" />
            ) : (
              <span>{activeProfile.nickname.slice(0, 1)}</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            className="login-button"
            onClick={() =>
              openDrawer(
                isQQ ? 'qq-login' : isKugou ? 'kugou-login' : isBodian ? 'bodian-login' : 'login',
              )
            }
          >
            <LogIn size={15} strokeWidth={1.9} />
            <span className="login-label">
              {isQQ
                ? '登录QQ音乐'
                : isKugou
                  ? '登录酷狗'
                  : isBodian
                    ? '登录波点'
                    : '登录网易云'}
            </span>
          </button>
        )}
      </div>

      <span className="sr-only">
        {active >= 0 ? `当前歌词第 ${active + 1} 行` : '暂无歌词'}
        {checks.every(Boolean) ? '，平台验证已全部通过' : '，平台验证尚未全部通过'}
      </span>
    </header>
  );
}

export function StatusGlyph({ ok }: { ok: boolean }) {
  return ok ? <Check size={14} strokeWidth={2.4} /> : <CircleDashed size={14} strokeWidth={1.8} />;
}
