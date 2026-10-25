import { useEffect } from 'react';
import { BottomTabs } from '@/components/BottomTabs';
import { BookPicker } from '@/screens/BookPicker';
import { LearnHome } from '@/screens/LearnHome';
import { LearnScreen } from '@/screens/LearnScreen';
import { MyScreen } from '@/screens/MyScreen';
import { PlaylistWorld } from '@/screens/PlaylistWorld';
import { useAppStore } from '@/state/app';
import { useStudyStore } from '@/studyStore';

export default function App() {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const session = useAppStore((state) => state.session);
  const picking = useAppStore((state) => state.picking);
  const bookId = useAppStore((state) => state.bookId);
  const endSession = useAppStore((state) => state.endSession);

  useEffect(() => {
    useStudyStore.getState().init();
  }, []);

  return (
    <div className="app" data-view={view}>
      <main className="app-stage">
        <div className={`stage-layer ${view === 'learn' ? '' : 'is-hidden'}`} aria-hidden={view !== 'learn'}>
          {session ? (
            <LearnScreen
              active={view === 'learn'}
              cards={session.cards}
              bookId={bookId ?? ''}
              onExit={endSession}
            />
          ) : picking ? (
            <BookPicker />
          ) : (
            <LearnHome />
          )}
        </div>
        <div
          className={`stage-layer ${view === 'playlists' ? '' : 'is-hidden'}`}
          aria-hidden={view !== 'playlists'}
        >
          <PlaylistWorld active={view === 'playlists'} />
        </div>
        {view === 'me' ? (
          <div className="stage-layer">
            <MyScreen />
          </div>
        ) : null}
      </main>
      <BottomTabs view={view} onChange={setView} />
    </div>
  );
}
