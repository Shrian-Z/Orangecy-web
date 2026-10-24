import { BookOpen, Library, RotateCcw, User } from 'lucide-react';
import { useAppStore } from '@/state/app';
import type { AppView } from '@/state/app';

const TABS: { view: AppView; label: string; Icon: typeof BookOpen }[] = [
  { view: 'learn', label: '学习', Icon: BookOpen },
  { view: 'review', label: '复习', Icon: RotateCcw },
  { view: 'books', label: '词书', Icon: Library },
  { view: 'me', label: '我的', Icon: User },
];

export default function App() {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const EmptyIcon = TABS.find((tab) => tab.view === view)?.Icon ?? BookOpen;

  return (
    <div className="app" data-view={view}>
      <main className="app-stage">
        {view === 'learn' ? (
          <div className="app-placeholder" aria-hidden="true" />
        ) : (
          <span className="empty-glyph" aria-hidden="true">
            <EmptyIcon size={24} strokeWidth={1.8} />
          </span>
        )}
      </main>
      <nav className="tabs" aria-label="主导航">
        <div className="tabs-inner">
          {TABS.map(({ view: tabView, label, Icon }) => (
            <button
              type="button"
              key={tabView}
              className={`tab ${tabView === view ? 'is-active' : ''}`}
              onClick={() => setView(tabView)}
              aria-label={label}
              aria-current={tabView === view ? 'page' : undefined}
            >
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
