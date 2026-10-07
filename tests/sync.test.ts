import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TablicaDB } from '../src/db/db';
import type { ImageObj, Notebook, Page, StrokeObj, Subject } from '../src/db/types';
import { syncOnce } from '../src/sync/engine';
import { MemoryStore } from '../src/sync/store';

let t = 1000;
const now = () => ++t;
const base = (id: string) => ({ id, updatedAt: now(), deleted: 0 as const, dirty: 1 as const });
const stroke = (id: string, pageId: string): StrokeObj => ({
  ...base(id), pageId, type: 'stroke', tool: 'pen', color: '#000', width: 0.6, pressure: true, points: [[1, 1, 0.5], [5, 5, 0.5]], z: t,
});

let yoga: TablicaDB, iphone: TablicaDB, drive: MemoryStore;

beforeEach(async () => {
  yoga = new TablicaDB('yoga-' + Math.random());
  iphone = new TablicaDB('iphone-' + Math.random());
  drive = new MemoryStore();
  // Yoga: przedmiot, zeszyt, strona z jedną kreską
  await yoga.subjects.put({ ...base('s1'), name: 'Analiza', color: '#000', order: 'a0' } as Subject);
  await yoga.notebooks.put({ ...base('n1'), subjectId: 's1', name: 'Wykłady', order: 'a0' } as Notebook);
  await yoga.pages.put({ ...base('p1'), notebookId: 'n1', order: 'a0', background: 'grid' } as Page);
  await yoga.objects.put(stroke('k1', 'p1'));
});

describe('synchronizacja dwóch urządzeń przez Drive', () => {
  it('nowe urządzenie pobiera wszystko', async () => {
    await syncOnce(yoga, drive);
    await syncOnce(iphone, drive);
    expect((await iphone.subjects.toArray()).map((s) => s.name)).toEqual(['Analiza']);
    expect(await iphone.objects.count()).toBe(1);
    // po synchronizacji nic nie jest „brudne”
    expect(await yoga.objects.where('dirty').equals(1).count()).toBe(0);
    expect(await iphone.objects.where('dirty').equals(1).count()).toBe(0);
  });

  it('pismo dopisane offline na obu urządzeniach na tej samej stronie – obie wersje przetrwają', async () => {
    await syncOnce(yoga, drive);
    await syncOnce(iphone, drive);
    await yoga.objects.put(stroke('k-yoga', 'p1'));
    await iphone.objects.put(stroke('k-iphone', 'p1'));
    await syncOnce(yoga, drive);
    await syncOnce(iphone, drive);
    await syncOnce(yoga, drive);
    const ids = async (d: TablicaDB) => (await d.objects.where('pageId').equals('p1').toArray()).map((o) => o.id).sort();
    expect(await ids(yoga)).toEqual(['k-iphone', 'k-yoga', 'k1']);
    expect(await ids(iphone)).toEqual(['k-iphone', 'k-yoga', 'k1']);
  });

  it('usunięcie zeszytu na telefonie znika też na Yodze', async () => {
    await syncOnce(yoga, drive);
    await syncOnce(iphone, drive);
    const nb = (await iphone.notebooks.get('n1'))!;
    await iphone.notebooks.put({ ...nb, deleted: 1, dirty: 1, updatedAt: now() });
    await syncOnce(iphone, drive);
    await syncOnce(yoga, drive);
    expect((await yoga.notebooks.get('n1'))?.deleted).toBe(1);
  });

  it('zdjęcia trafiają na Drive i na drugie urządzenie', async () => {
    const data = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    await yoga.blobs.put({ id: 'h1', hash: 'h1', mime: 'image/jpeg', data });
    await yoga.objects.put({ ...base('img1'), pageId: 'p1', type: 'image', x: 0, y: 0, w: 10, h: 10, rotation: 0, blobId: 'h1', z: t } as ImageObj);
    await syncOnce(yoga, drive);
    await syncOnce(iphone, drive);
    const b = await iphone.blobs.get('h1');
    expect(await b?.data.text()).toBe('jpeg-bytes');
  });

  it('gdy nic się nie zmieniło, synchronizacja tylko sprawdza listę plików', async () => {
    await syncOnce(yoga, drive);
    const r = await syncOnce(yoga, drive);
    expect(r).toMatchObject({ uploaded: 0, downloaded: 0 });
  });
});
