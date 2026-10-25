import { useEffect, useState } from 'react';
import type { FocusCardData } from '@/cards';
import type { WordbookWord } from '@/lib/wordbook';
import type { ImportedBook, ImportedBookMeta } from '@/lib/importDeck';
import { isImportedBookId } from '@/lib/importDeck';

/**
 * Personal imported books live in IndexedDB, not localStorage: a 3.7k-word
 * book plus its music cards is a few megabytes, and the deck must survive
 * reloads without blocking first paint.
 */

const DB_NAME = 'orangecy.imports';
const DB_VERSION = 1;
const META_STORE = 'meta';
const DATA_STORE = 'data';
const CHANGE_EVENT = 'orangecy-imports-changed';

let dbPromise: Promise<IDBDatabase> | null = null;
let metaCache: ImportedBookMeta[] = [];
const dataCache = new Map<string, ImportedBook>();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('导入词书存储不可用'));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function requestDone<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('导入词书读写失败'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('导入词书写入失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('导入词书写入取消'));
  });
}

export function notifyImportsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeImports(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export async function listImportedBooks(): Promise<ImportedBookMeta[]> {
  try {
    const db = await openDb();
    const transaction = db.transaction(META_STORE, 'readonly');
    const rows = await requestDone(
      transaction.objectStore(META_STORE).getAll() as IDBRequest<ImportedBookMeta[]>,
    );
    metaCache = rows.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    return metaCache;
  } catch (error) {
    console.warn('[imports] 读取导入词书失败', error);
    return [];
  }
}

export async function getImportedBook(id: string): Promise<ImportedBook | null> {
  const cached = dataCache.get(id);
  if (cached) return cached;
  try {
    const db = await openDb();
    const transaction = db.transaction([META_STORE, DATA_STORE], 'readonly');
    const meta = await requestDone(
      transaction.objectStore(META_STORE).get(id) as IDBRequest<ImportedBookMeta | undefined>,
    );
    if (!meta) return null;
    const data = await requestDone(
      transaction.objectStore(DATA_STORE).get(id) as IDBRequest<
        { id: string; words: WordbookWord[]; cards: FocusCardData[] } | undefined
      >,
    );
    if (!data) return null;
    const book = { ...meta, words: data.words, cards: data.cards };
    dataCache.set(id, book);
    return book;
  } catch (error) {
    console.warn('[imports] 读取导入词书失败', error);
    return null;
  }
}

export async function saveImportedBook(book: ImportedBook): Promise<void> {
  const db = await openDb();
  const { words, cards, ...meta } = book;
  const transaction = db.transaction([META_STORE, DATA_STORE], 'readwrite');
  transaction.objectStore(META_STORE).put(meta);
  transaction.objectStore(DATA_STORE).put({ id: book.id, words, cards });
  await transactionDone(transaction);
  metaCache = [meta, ...metaCache.filter((item) => item.id !== meta.id)];
  dataCache.set(book.id, book);
  notifyImportsChanged();
}

export async function deleteImportedBook(id: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([META_STORE, DATA_STORE], 'readwrite');
  transaction.objectStore(META_STORE).delete(id);
  transaction.objectStore(DATA_STORE).delete(id);
  await transactionDone(transaction);
  metaCache = metaCache.filter((item) => item.id !== id);
  dataCache.delete(id);
  notifyImportsChanged();
}

export function useImportedBooks() {
  const [books, setBooks] = useState<ImportedBookMeta[]>(metaCache);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void listImportedBooks().then((next) => {
        if (alive) setBooks(next);
      });
    };
    load();
    const off = subscribeImports(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return books;
}

export function useImportedBook(id: string | null) {
  const [book, setBook] = useState<ImportedBook | null>(() =>
    id && isImportedBookId(id) ? dataCache.get(id) ?? null : null,
  );

  useEffect(() => {
    if (!isImportedBookId(id) || !id) {
      setBook(null);
      return;
    }
    const cached = dataCache.get(id);
    setBook(cached ?? null);
    let alive = true;
    const load = () => {
      void getImportedBook(id).then((next) => {
        if (alive) setBook(next);
      });
    };
    load();
    const off = subscribeImports(load);
    return () => {
      alive = false;
      off();
    };
  }, [id]);

  return isImportedBookId(id) ? book : null;
}
