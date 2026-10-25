import { useCallback, useState } from 'react';
import { Check, ChevronLeft, FileUp, Trash2 } from 'lucide-react';
import { ImportSheet } from '@/components/ImportSheet';
import { isImportedBookId } from '@/lib/importDeck';
import type { ImportedBookMeta } from '@/lib/importDeck';
import { deleteImportedBook } from '@/lib/importStore';
import { useAppStore } from '@/state/app';
import { useBookList } from '@/today';

export function BookPicker() {
  const bookId = useAppStore((store) => store.bookId);
  const setBook = useAppStore((store) => store.setBook);
  const setPicking = useAppStore((store) => store.setPicking);
  const books = useBookList();
  const [importOpen, setImportOpen] = useState(false);

  const onImported = useCallback(
    (book: ImportedBookMeta) => {
      setBook(book.id);
    },
    [setBook],
  );

  const useBook = useCallback(() => {
    setImportOpen(false);
    setPicking(false);
  }, [setPicking]);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteImportedBook(id);
        if (bookId === id) setBook('');
      } catch (error) {
        console.warn('[imports] 删除失败', error);
      }
    },
    [bookId, setBook],
  );

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
        <button
          type="button"
          className="icon-action picker-import"
          onClick={() => setImportOpen(true)}
          aria-label="导入词汇"
        >
          <FileUp size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>
      <div className="picker-list">
        {books.map((book) => {
          const imported = isImportedBookId(book.id);
          const current = book.id === bookId;
          return (
            <div className={`picker-group ${current ? 'is-current' : ''}`} key={book.id}>
              <button
                type="button"
                className={`picker-row ${current ? 'is-current' : ''}`}
                onClick={() => {
                  setBook(book.id);
                  setPicking(false);
                }}
              >
                <span className="picker-name">{book.name}</span>
                <span className="picker-count">{book.count}</span>
                {current ? <Check size={18} strokeWidth={1.8} aria-hidden="true" /> : null}
              </button>
              {imported ? (
                <button
                  type="button"
                  className="icon-action picker-delete"
                  onClick={() => void remove(book.id)}
                  aria-label={`删除${book.name}`}
                >
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onImported}
        onUseBook={useBook}
      />
    </div>
  );
}
