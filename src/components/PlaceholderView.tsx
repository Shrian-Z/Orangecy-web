import { Library, RotateCcw, User } from 'lucide-react';
import type { AppView } from '@/state/app';

const ICONS = {
  review: RotateCcw,
  books: Library,
  me: User,
} as const;

export function PlaceholderView({ view }: { view: Exclude<AppView, 'learn'> }) {
  const Icon = ICONS[view];
  return (
    <div className="placeholder" aria-hidden="true">
      <Icon size={24} strokeWidth={1.6} />
    </div>
  );
}
