import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/api';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { CoverStage } from '@/components/CoverStage';
import { LyricsStage } from '@/components/LyricsStage';
import { PlayerBar } from '@/components/PlayerBar';
import { Toasts } from '@/components/Toasts';
import { TopBar } from '@/components/TopBar';
import { WordbookModal } from '@/components/WordbookModal';
import { WordPeek } from '@/components/WordPeek';
import { buildSongMatches, loadWordbook, loadWordbookIndex } from '@/lib/wordbook';

const SearchDrawer = lazy(() =>
  import('@/components/SearchDrawer').then((module) => ({ default: module.SearchDrawer })),
);
const QueueDrawer = lazy(() =>
  import('@/components/QueueDrawer').then((module) => ({ default: module.QueueDrawer })),
);
const LoginModal = lazy(() =>
  import('@/components/LoginModal').then((module) => ({ default: module.LoginModal })),
);
const QQLoginModal = lazy(() =>
  import('@/components/QQLoginModal').then((module) => ({ default: module.QQLoginModal })),
);
const KugouLoginModal = lazy(() =>
  import('@/components/KugouLoginModal').then((module) => ({ default: module.KugouLoginModal })),
);
const BodianLoginModal = lazy(() =>
  import('@/components/BodianLoginModal').then((module) => ({ default: module.BodianLoginModal })),
);
const PlatformDrawer = lazy(() =>
  import('@/components/PlatformDrawer').then((module) => ({ default: module.PlatformDrawer })),
);
const CheckDrawer = lazy(() =>
  import('@/components/CheckDrawer').then((module) => ({ default: module.CheckDrawer })),
);
const WordCards = lazy(() =>
  import('@/components/WordCards').then((module) => ({ default: module.WordCards })),
);
const RecommendView = lazy(() =>
  import('@/components/RecommendView').then((module) => ({ default: module.RecommendView })),
);

function Once({ open, children }: { open: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(open);
  useEffect(() => {
    if (open) setSeen(true);
  }, [open]);
  return open || seen ? <>{children}</> : null;
}
import { useStudyStore } from '@/studyStore';

const DEFAULT_SONG_ID = '1824878724';

export default function App() {
  const booted = usePlayerStore((state) => state.booted);
  const drawer = usePlayerStore((state) => state.drawer);
  const wordbookPrompt = usePlayerStore((state) => state.wordbookPrompt);
  const view = usePlayerStore((state) => state.view);
  const song = usePlayerStore((state) => state.song);
  const lines = usePlayerStore((state) => state.lines);
  const wordbook = usePlayerStore((state) => state.wordbook);
  const reduceMotion = usePlayerStore((state) => state.reduceMotion);
  const bootedOnce = useRef(false);

  const studyMatches = useMemo(
    () => (wordbook && lines.length ? buildSongMatches(lines, wordbook) : null),
    [wordbook, lines],
  );

  useEffect(() => {
    useStudyStore.getState().init();
  }, []);

  useEffect(() => {
    if (!wordbook || !song || !studyMatches) return;
    useStudyStore.getState().sync({ wordbook, matches: studyMatches, song });
  }, [wordbook, song, studyMatches]);

  useEffect(() => {
    if (bootedOnce.current) return;
    bootedOnce.current = true;
    player.boot();

    const boot = async () => {
      const [authResult, songResult, indexResult] = await Promise.allSettled([
        api.authStatus(),
        api.song(DEFAULT_SONG_ID),
        loadWordbookIndex(),
      ]);

      if (authResult.status === 'fulfilled') {
        usePlayerStore.getState().setAuth(authResult.value);
      }

      void api.qq
        .authStatus()
        .then((status) => usePlayerStore.getState().setQQAuth(status))
        .catch(() => {
          // QQ sidecar 没起来时不阻塞网易云链路
        });

      void api.kugou
        .authStatus()
        .then((status) => usePlayerStore.getState().setKugouAuth(status))
        .catch(() => {
          // 酷狗设备注册失败时不阻塞主链路
        });

      void api.bodian
        .authStatus()
        .then((status) => usePlayerStore.getState().setBodianAuth(status))
        .catch(() => {
          // 波点会话恢复失败时不阻塞主链路
        });

      let book = null;
      if (indexResult.status === 'fulfilled') {
        usePlayerStore.getState().setWordbookIndex(indexResult.value);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem('orangecy.wordbook');
        } catch {
          saved = null;
        }
        if (saved && indexResult.value.books.some((item) => item.id === saved)) {
          try {
            book = await loadWordbook(saved);
          } catch {
            book = null;
          }
        }
      }

      if (book) usePlayerStore.getState().setWordbook(book);

      if (songResult.status === 'fulfilled') {
        await player.loadSong(songResult.value.song);
      } else {
        usePlayerStore
          .getState()
          .pushToast('默认曲目没加载出来，先搜一首歌吧', 'error');
      }

      usePlayerStore.getState().setBooted(true);
      if (!book) {
        window.setTimeout(() => usePlayerStore.getState().setWordbookPrompt(true), 620);
      }
    };

    void boot();
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawer || wordbookPrompt ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawer, wordbookPrompt]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const world = view === 'player' || view === 'recommend' ? 'blue' : 'white';

  useEffect(() => {
    document.documentElement.dataset.world = world;
    document.body.dataset.world = world;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    themeMeta?.setAttribute('content', world === 'blue' ? '#002FA7' : '#FFFFFF');
  }, [world]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest('input, textarea, [contenteditable="true"]'));

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        usePlayerStore.getState().openDrawer('search');
        return;
      }
      if (event.key === 'Escape') {
        usePlayerStore.getState().openDrawer(null);
        return;
      }
      if (typing || target?.closest('button, a, select, [role="button"]')) return;

      if (event.code === 'Space') {
        event.preventDefault();
        void player.toggle();
        return;
      }
      const { currentTime, view } = usePlayerStore.getState();
      if (view === 'cards') return;
      if (event.key === 'ArrowRight') {
        void player.seekTo(currentTime + 5, { play: false });
      }
      if (event.key === 'ArrowLeft') {
        void player.seekTo(currentTime - 5, { play: false });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app" data-world={world}>
      <TopBar />
      {view === 'player' ? (
        <main className="stage">
          <CoverStage />
          <LyricsStage />
        </main>
      ) : (
        <Suspense
          fallback={
            <div className="view-loading" role="status">
              <span className="status-dot is-live" />
              正在载入…
            </div>
          }
        >
          {view === 'recommend' ? (
            <RecommendView />
          ) : view === 'review' ? (
            <WordCards key="review" mode="review" />
          ) : (
            <WordCards key="learn" mode="learn" />
          )}
        </Suspense>
      )}
      {view === 'player' || view === 'recommend' ? <PlayerBar /> : null}
      <Suspense fallback={null}>
        <Once open={drawer === 'search'}>
          <SearchDrawer />
        </Once>
        <Once open={drawer === 'queue'}>
          <QueueDrawer />
        </Once>
        <Once open={drawer === 'login'}>
          <LoginModal />
        </Once>
        <Once open={drawer === 'qq-login'}>
          <QQLoginModal />
        </Once>
        <Once open={drawer === 'kugou-login'}>
          <KugouLoginModal />
        </Once>
        <Once open={drawer === 'bodian-login'}>
          <BodianLoginModal />
        </Once>
        <Once open={drawer === 'platforms'}>
          <PlatformDrawer />
        </Once>
        <Once open={drawer === 'check'}>
          <CheckDrawer />
        </Once>
      </Suspense>
      <WordbookModal />
      <WordPeek />
      <Toasts />

      <div className={`splash ${booted ? 'is-done' : ''}`} aria-hidden={booted}>
        <div className="splash-mark">
          <span className="splash-orbit" />
          <span className="splash-core">O</span>
        </div>
        <p>Orangecy</p>
        <small>把歌里的词，留下来</small>
      </div>
    </div>
  );
}
