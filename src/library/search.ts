import { db } from '../db/db';
import type { ID, Notebook, Page, Subject } from '../db/types';
import { plainText } from '../text/extensions';

/** Porównanie bez wielkości liter i polskich znaków: „całka” znajdzie „CALKA” i odwrotnie. */
export const normalize = (s: string) =>
  s.replace(/[łŁ]/g, 'l').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export interface SearchResult {
  kind: 'notebook' | 'text';
  subject: Subject;
  notebook: Notebook;
  pageId?: ID;
  pageIndex?: number;
  snippet?: string;
}

function snippet(text: string, q: string): string {
  const i = normalize(text).indexOf(q);
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + q.length + 60);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

/** Przeszukuje nazwy zeszytów/przedmiotów i tekst pisany z klawiatury (pismo odręczne – bez OCR). */
export async function searchAll(query: string, limit = 60): Promise<SearchResult[]> {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const [subjects, notebooks, pages, objects] = await Promise.all([
    db.subjects.toArray(), db.notebooks.toArray(), db.pages.toArray(), db.objects.toArray(),
  ]);
  const subj = new Map(subjects.filter((s) => !s.deleted).map((s) => [s.id, s]));
  const nbs = new Map(notebooks.filter((n) => !n.deleted && subj.has(n.subjectId)).map((n) => [n.id, n]));
  // numer strony w zeszycie (kolejność wg klucza `order`)
  const byNb = new Map<ID, Page[]>();
  for (const p of pages) if (!p.deleted && nbs.has(p.notebookId)) (byNb.get(p.notebookId) ?? byNb.set(p.notebookId, []).get(p.notebookId)!).push(p);
  const pageInfo = new Map<ID, { nb: Notebook; index: number }>();
  for (const [nbId, list] of byNb) {
    list.sort((a, b) => (a.order < b.order ? -1 : 1)).forEach((p, i) => pageInfo.set(p.id, { nb: nbs.get(nbId)!, index: i }));
  }

  const results: SearchResult[] = [];
  for (const nb of nbs.values()) {
    const s = subj.get(nb.subjectId)!;
    if (normalize(nb.name).includes(q) || normalize(s.name).includes(q)) results.push({ kind: 'notebook', subject: s, notebook: nb });
  }
  for (const o of objects) {
    if (results.length >= limit) break;
    if (o.deleted || o.type !== 'text') continue;
    const info = pageInfo.get(o.pageId);
    if (!info) continue;
    const text = plainText(o.doc).join(' ');
    if (!normalize(text).includes(q)) continue;
    results.push({
      kind: 'text',
      subject: subj.get(info.nb.subjectId)!,
      notebook: info.nb,
      pageId: o.pageId,
      pageIndex: info.index,
      snippet: snippet(text, q),
    });
  }
  return results;
}
