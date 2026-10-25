import { Check, ChevronLeft } from 'lucide-react';
import { useAppStore } from '@/state/app';
import { BOOKS } from '@/today';

export function BookPicker() {
  const bookId = useAppStore((store) => store.bookId);
  const setBook = useAppStore((store) => store.setBook);
  const setPicking = useAppStore((store) => store.setPicking);

  return (
    <div className="picker">
      <header className="page-head">
        <button
          type="button"
          className="icon-action"
          onClick={() => setPicking(false)}
          aria-label="返回"
        >
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>
      <div className="picker-list">
        {BOOKS.map((book) => (
          <button
            type="button"
            key={book.id}
            className={`picker-row ${book.id === bookId ? 'is-current' : ''}`}
            onClick={() => {
              setBook(book.id);
              setPicking(false);
            }}
          >
            <span className="picker-name">{book.name}</span>
            <span className="picker-count">{book.count}</span>
            {book.id === bookId ? <Check size={18} strokeWidth={1.8} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
