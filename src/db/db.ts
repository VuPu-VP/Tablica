import Dexie, { type Table } from 'dexie';
import type { Notebook, Page, PageObject, StoredBlob, Subject } from './types';

// IndexedDB to baza wbudowana w przeglądarkę – działa offline i przetrwa zamknięcie aplikacji.
// Dexie to cienka nakładka, dzięki której zamiast callbacków piszemy zwykłe `await db.pages.get(id)`.
export class TablicaDB extends Dexie {
  subjects!: Table<Subject, string>;
  notebooks!: Table<Notebook, string>;
  pages!: Table<Page, string>;
  objects!: Table<PageObject, string>;
  blobs!: Table<StoredBlob, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor(name = 'tablica') {
    super(name);
    // Wypisujemy tylko pola, po których szukamy (indeksy) – reszta obiektu i tak jest zapisywana.
    this.version(1).stores({
      subjects: 'id, dirty',
      notebooks: 'id, subjectId, dirty',
      pages: 'id, notebookId, dirty',
      objects: 'id, pageId, dirty',
      blobs: 'id, hash',
      meta: 'key',
    });
  }
}

export const db = new TablicaDB();

/** Prosi przeglądarkę, żeby nie czyściła danych przy braku miejsca (ważne na iOS). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
