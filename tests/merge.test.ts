import { describe, expect, it } from 'vitest';
import type { Base } from '../src/db/types';
import { mergeById } from '../src/sync/merge';

type Obj = Base & { v: string };
const o = (id: string, updatedAt: number, v = id, deleted: 0 | 1 = 0): Obj => ({ id, updatedAt, v, deleted, dirty: 0 });

describe('scalanie (last-writer-wins per obiekt)', () => {
  it('kreski dopisane offline na dwóch urządzeniach sumują się', () => {
    const yoga = [o('a', 1), o('b', 5)]; // b narysowane na Yodze
    const iphone = [o('a', 1), o('c', 6)]; // c narysowane na iPhonie
    const r = mergeById(yoga, iphone);
    expect(r.merged.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
    expect(r.toLocal.map((x) => x.id)).toEqual(['c']);
    expect(r.remoteChanged).toBe(true); // b trzeba wysłać
  });

  it('przy edycji tego samego obiektu wygrywa nowsza wersja', () => {
    const r = mergeById([o('a', 10, 'lokalna')], [o('a', 20, 'zdalna')]);
    expect(r.merged[0].v).toBe('zdalna');
    expect(r.toLocal).toHaveLength(1);
    expect(r.remoteChanged).toBe(false);
  });

  it('nowszy nagrobek usuwa obiekt na drugim urządzeniu', () => {
    const r = mergeById([o('a', 5)], [o('a', 9, 'a', 1)]);
    expect(r.merged[0].deleted).toBe(1);
    expect(r.toLocal[0].deleted).toBe(1);
  });

  it('starszy nagrobek nie kasuje nowszej edycji', () => {
    const r = mergeById([o('a', 12, 'edytowana')], [o('a', 9, 'a', 1)]);
    expect(r.merged[0]).toMatchObject({ deleted: 0, v: 'edytowana' });
    expect(r.remoteChanged).toBe(true);
  });

  it('identyczne dane – nic do zrobienia', () => {
    const r = mergeById([o('a', 1), o('b', 2)], [o('a', 1), o('b', 2)]);
    expect(r.toLocal).toHaveLength(0);
    expect(r.remoteChanged).toBe(false);
  });

  it('pierwsza synchronizacja nowego urządzenia pobiera wszystko', () => {
    const r = mergeById([], [o('a', 1), o('b', 2)]);
    expect(r.toLocal).toHaveLength(2);
    expect(r.remoteChanged).toBe(false);
  });
});
