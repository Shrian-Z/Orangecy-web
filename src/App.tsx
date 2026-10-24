import { useEffect } from 'react';
import { BottomTabs } from '@/components/BottomTabs';
import { PlaceholderView } from '@/components/PlaceholderView';
import { LearnScreen } from '@/screens/LearnScreen';
import { MyScreen } from '@/screens/MyScreen';
import { useAppStore } from '@/state/app';
import { useStudyStore } from '@/studyStore';

export default function App() {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);

  useEffect(() => {
    useStudyStore.getState().init();
  }, []);

  return (
    <div className="app" data-view={view}>
      <main className="app-stage">
        <div className={`stage-layer ${view === 'learn' ? '' : 'is-hidden'}`} aria-hidden={view !== 'learn'}>
          <LearnScreen active={view === 'learn'} />
        </div>
        {view !== 'learn' ? (
          <div className="stage-layer">
            {view === 'me' ? <MyScreen /> : <PlaceholderView view={view} />}
          </div>
        ) : null}
      </main>
      <BottomTabs view={view} onChange={setView} />
    </div>
  );
}
