import { BookOpen, Library, RotateCcw, User } from 'lucide-react';
import type { AppView } from '@/state/app';

const TABS: { view: AppView; label: string; Icon: typeof BookOpen }[] = [
  { view: 'learn', label: '学习', Icon: BookOpen },
  { view: 'review', label: '复习', Icon: RotateCcw },
  { view: 'books', label: '词书', Icon: Library },
  { view: 'me', label: '我的', Icon: User },
];

export function BottomTabs({
  view,
  onChange,
}: {
  view: AppView;
  onChange: (view: AppView) => void;
}) {
  return (
    <nav className="tabs" aria-label="主导航">
      <div className="tabs-inner">
        {TABS.map(({ view: tabView, label, Icon }) => (
          <button
            type="button"
            key={tabView}
            className={`tab ${tabView === view ? 'is-active' : ''}`}
            onClick={() => onChange(tabView)}
            aria-label={label}
            aria-current={tabView === view ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ))}
      </div>
    </nav>
  );
}
