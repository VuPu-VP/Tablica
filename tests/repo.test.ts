import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import {
  copyPage, createNotebook, createPage, createSubject, deleteNotebook, deleteObjects, listNotebooks,
  listObjects, listPages, movePage, nextZ, putObjects, restoreObjects,
} from '../src/db/repo';
import type { StrokeObj } from '../src/db/types';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const stroke = (pageId: string, id = crypto.randomUUID()): StrokeObj => ({
  id, pageId, type: 'stroke', tool: 'pen', color: '#000', width: 0.6, pressure: true,
  points: [[1, 1, 0.5], [2, 2, 0.5]], z: nextZ(), updatedAt: 0, deleted: 0, dirty: 1,
});

describe('zeszyty i strony', () => {
  it('nowy zeszyt ma od razu pierwszą stronę', async () => {
    const s = await createSubject('Analiza', '#000');
    const nb = await createNotebook(s.id, 'Wykłady');
    expect(await listPages(nb.id)).toHaveLength(1);
  });

  it('wstawia stronę pomiędzy istniejące bez zmiany pozostałych', async () => {
    const s = await createSubject('Fizyka', '#000');
    const nb = await createNotebook(s.id, 'Lab');
    const [p1] = await listPages(nb.id);
    const p2 = await createPage(nb.id, 'end');
    const p3 = await createPage(nb.id, 'end');
    const before = { p1: p1.order, p2: p2.order, p3: p3.order };
    const mid = await createPage(nb.id, p2.id); // między 2 a 3
    const ids = (await listPages(nb.id)).map((p) => p.id);
    expect(ids).toEqual([p1.id, p2.id, mid.id, p3.id]);
    const after = await listPages(nb.id);
    expect(after.find((p) => p.id === p3.id)!.order).toBe(before.p3); // stara strona nietknięta
  });

  it('przenosi stronę do innego zeszytu', async () => {
    const s = await createSubject('Angielski', '#000');
    const a = await createNotebook(s.id, 'A');
    const b = await createNotebook(s.id, 'B');
    const [pa] = await listPages(a.id);
    const [pb] = await listPages(b.id);
    await movePage(pa.id, b.id, null);
    expect(await listPages(a.id)).toHaveLength(0);
    expect((await listPages(b.id)).map((p) => p.id)).toEqual([pa.id, pb.id]);
  });

  it('kopiuje stronę razem z kreskami (nowe ID)', async () => {
    const s = await createSubject('Prog', '#000');
    const nb = await createNotebook(s.id, 'Notatki');
    const [p] = await listPages(nb.id);
    await putObjects([stroke(p.id), stroke(p.id)]);
    const copy = (await copyPage(p.id, nb.id, p.id))!;
    const objs = await listObjects(copy.id);
    expect(objs).toHaveLength(2);
    expect(objs.every((o) => o.pageId === copy.id)).toBe(true);
    expect(await listObjects(p.id)).toHaveLength(2);
  });

  it('usuwanie zostawia nagrobki (potrzebne do synchronizacji)', async () => {
    const s = await createSubject('X', '#000');
    const nb = await createNotebook(s.id, 'Y');
    await deleteNotebook(nb.id);
    expect(await listNotebooks(s.id)).toHaveLength(0);
    const raw = await db.notebooks.get(nb.id);
    expect(raw?.deleted).toBe(1);
    expect(raw?.dirty).toBe(1);
  });
});

describe('obiekty', () => {
  it('usuń i przywróć (cofnij)', async () => {
    const o = stroke('page-1');
    await putObjects([o]);
    await deleteObjects([o.id]);
    expect(await listObjects('page-1')).toHaveLength(0);
    await restoreObjects([o]);
    expect(await listObjects('page-1')).toHaveLength(1);
  });
});
