import { generateKeyBetween } from 'fractional-indexing';
import { db } from './db';
import type { Background, ID, Notebook, Page, PageObject, Subject } from './types';

export const newId = (): ID => crypto.randomUUID();

/** Oznacza rekord jako zmieniony teraz i czekający na synchronizację. */
export function touch<T extends { updatedAt: number; dirty: 0 | 1 }>(e: T): T {
  return { ...e, updatedAt: Date.now(), dirty: 1 };
}

const alive = <T extends { deleted: 0 | 1 }>(e: T | undefined): e is T => !!e && !e.deleted;
const byOrder = (a: { order: string }, b: { order: string }) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

// ---------- Przedmioty ----------

export async function listSubjects(): Promise<Subject[]> {
  return (await db.subjects.toArray()).filter(alive).sort(byOrder);
}

export async function createSubject(name: string, color: string): Promise<Subject> {
  const last = (await listSubjects()).at(-1);
  const s: Subject = touch({ id: newId(), name, color, order: generateKeyBetween(last?.order ?? null, null), updatedAt: 0, deleted: 0, dirty: 1 });
  await db.subjects.put(s);
  return s;
}

export async function updateSubject(id: ID, patch: Partial<Pick<Subject, 'name' | 'color'>>) {
  const s = await db.subjects.get(id);
  if (s) await db.subjects.put(touch({ ...s, ...patch }));
}

export async function deleteSubject(id: ID) {
  await db.transaction('rw', db.subjects, db.notebooks, db.pages, async () => {
    const s = await db.subjects.get(id);
    if (s) await db.subjects.put(touch({ ...s, deleted: 1 }));
    for (const nb of await db.notebooks.where('subjectId').equals(id).toArray()) await deleteNotebookInner(nb);
  });
}

// ---------- Zeszyty ----------

export async function listNotebooks(subjectId: ID): Promise<Notebook[]> {
  return (await db.notebooks.where('subjectId').equals(subjectId).toArray()).filter(alive).sort(byOrder);
}

export async function createNotebook(subjectId: ID, name: string): Promise<Notebook> {
  const last = (await listNotebooks(subjectId)).at(-1);
  const nb: Notebook = touch({ id: newId(), subjectId, name, order: generateKeyBetween(last?.order ?? null, null), updatedAt: 0, deleted: 0, dirty: 1 });
  await db.transaction('rw', db.notebooks, db.pages, async () => {
    await db.notebooks.put(nb);
    await createPage(nb.id, null); // nowy zeszyt od razu ma pierwszą stronę
  });
  return nb;
}

export async function renameNotebook(id: ID, name: string) {
  const nb = await db.notebooks.get(id);
  if (nb) await db.notebooks.put(touch({ ...nb, name }));
}

async function deleteNotebookInner(nb: Notebook) {
  await db.notebooks.put(touch({ ...nb, deleted: 1 }));
  for (const p of await db.pages.where('notebookId').equals(nb.id).toArray()) {
    if (!p.deleted) await db.pages.put(touch({ ...p, deleted: 1 }));
  }
}

export async function deleteNotebook(id: ID) {
  await db.transaction('rw', db.notebooks, db.pages, async () => {
    const nb = await db.notebooks.get(id);
    if (nb) await deleteNotebookInner(nb);
  });
}

// ---------- Strony ----------

export async function listPages(notebookId: ID): Promise<Page[]> {
  return (await db.pages.where('notebookId').equals(notebookId).toArray()).filter(alive).sort(byOrder);
}

/**
 * Tworzy stronę zaraz PO stronie `afterPageId` (null = na początku, 'end' = na końcu).
 * Dzięki kluczom frakcyjnym wstawienie strony między 3 i 4 nie zmienia pozostałych stron.
 */
export async function createPage(notebookId: ID, afterPageId: ID | null | 'end', background?: Background): Promise<Page> {
  const pages = await listPages(notebookId);
  let idx: number;
  if (afterPageId === 'end') idx = pages.length - 1;
  else if (afterPageId === null) idx = -1;
  else idx = pages.findIndex((p) => p.id === afterPageId);
  const before = idx >= 0 ? pages[idx] : undefined;
  const after = pages[idx + 1];
  const page: Page = touch({
    id: newId(),
    notebookId,
    order: generateKeyBetween(before?.order ?? null, after?.order ?? null),
    background: background ?? before?.background ?? after?.background ?? 'grid',
    updatedAt: 0,
    deleted: 0,
    dirty: 1,
  });
  await db.pages.put(page);
  return page;
}

export async function setPageBackground(id: ID, background: Background) {
  const p = await db.pages.get(id);
  if (p) await db.pages.put(touch({ ...p, background }));
}

export async function deletePage(id: ID) {
  const p = await db.pages.get(id);
  if (p) await db.pages.put(touch({ ...p, deleted: 1 }));
}

/** Przenosi stronę (także do innego zeszytu) tak, żeby znalazła się po `afterPageId`. */
export async function movePage(id: ID, targetNotebookId: ID, afterPageId: ID | null) {
  const p = await db.pages.get(id);
  if (!p) return;
  const pages = (await listPages(targetNotebookId)).filter((x) => x.id !== id);
  const idx = afterPageId === null ? -1 : pages.findIndex((x) => x.id === afterPageId);
  const order = generateKeyBetween(idx >= 0 ? pages[idx].order : null, pages[idx + 1]?.order ?? null);
  await db.pages.put(touch({ ...p, notebookId: targetNotebookId, order }));
}

/** Kopiuje stronę razem z zawartością (nowe ID dla strony i każdego obiektu). */
export async function copyPage(id: ID, targetNotebookId: ID, afterPageId: ID | null | 'end'): Promise<Page | undefined> {
  const src = await db.pages.get(id);
  if (!src) return;
  return db.transaction('rw', db.pages, db.objects, async () => {
    const copy = await createPage(targetNotebookId, afterPageId, src.background);
    const withPdf = touch({ ...copy, pdf: src.pdf });
    await db.pages.put(withPdf);
    const objs = await listObjects(id);
    await db.objects.bulkPut(objs.map((o) => touch({ ...o, id: newId(), pageId: copy.id })));
    return withPdf;
  });
}

// ---------- Obiekty na stronie ----------

export async function listObjects(pageId: ID): Promise<PageObject[]> {
  return (await db.objects.where('pageId').equals(pageId).toArray()).filter(alive).sort((a, b) => a.z - b.z);
}

export async function putObjects(objs: PageObject[]) {
  await db.objects.bulkPut(objs.map((o) => touch(o)));
}

/** Zmienia wybrane pola obiektu (na najświeższej wersji z bazy). */
export async function patchObject(id: ID, patch: Partial<PageObject>) {
  const o = await db.objects.get(id);
  if (o && !o.deleted) await db.objects.put(touch({ ...o, ...patch } as PageObject));
}

export async function deleteObjects(ids: ID[]) {
  const objs = await db.objects.bulkGet(ids);
  await db.objects.bulkPut(objs.filter(alive).map((o) => touch({ ...o, deleted: 1 as const })));
}

/** Przywraca obiekty (np. przy cofnięciu usunięcia). */
export async function restoreObjects(objs: PageObject[]) {
  await db.objects.bulkPut(objs.map((o) => touch({ ...o, deleted: 0 as const })));
}

let zCounter = 0;
/** Kolejny numer warstwy: czas + licznik, żeby dwa obiekty z tej samej milisekundy się nie zrównały. */
export const nextZ = () => Date.now() * 1000 + (zCounter = (zCounter + 1) % 1000);
