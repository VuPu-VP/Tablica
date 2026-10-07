import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { createNotebook, createSubject, listPages, nextZ, putObjects } from '../src/db/repo';
import { normalize, searchAll } from '../src/library/search';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('wyszukiwarka', () => {
  it('ignoruje wielkość liter i polskie znaki (także ł)', () => {
    expect(normalize('CAŁKA Źródło')).toBe('calka zrodlo');
  });

  it('znajduje tekst na stronie i podaje numer strony', async () => {
    const s = await createSubject('Analiza', '#000');
    const nb = await createNotebook(s.id, 'Wykłady');
    const [p1] = await listPages(nb.id);
    await putObjects([{
      id: 't1', pageId: p1.id, type: 'text', x: 0, y: 0, w: 50, z: nextZ(), updatedAt: 0, deleted: 0, dirty: 1,
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Twierdzenie o całce oznaczonej' }] }] },
    }]);
    const r = await searchAll('calce');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'text', pageIndex: 0 });
    expect(r[0].snippet).toContain('całce');
    expect((await searchAll('wykł')).map((x) => x.kind)).toEqual(['notebook']);
  });
});
