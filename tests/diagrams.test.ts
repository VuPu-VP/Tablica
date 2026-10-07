import { describe, expect, it } from 'vitest';
import type { CircuitEl, PlotObj } from '../src/db/types';
import { junctions, nextLabel, normalize } from '../src/diagrams/circuit';
import { applyQuadrants, fitToData, niceStep, parsePoints, quadrantsOf, ticks } from '../src/diagrams/plot';

describe('wykres – dane i podziałka', () => {
  it('wklejka z polskiego Excela (tabulator, przecinek dziesiętny)', () => {
    expect(parsePoints('0\t0\n1,5\t2,25\n2\t4')).toEqual([[0, 0], [1.5, 2.25], [2, 4]]);
  });
  it('spacje, średniki, „x,y” i śmieci', () => {
    expect(parsePoints('1 2\n3;4\n5,6\nU [V]\tI [mA]\n\n7.5 8')).toEqual([[1, 2], [3, 4], [5, 6], [7.5, 8]]);
  });
  it('ładny krok podziałki', () => {
    expect(niceStep(10)).toBe(1);
    expect(niceStep(37)).toBe(5);
    expect(niceStep(0.8)).toBe(0.1);
  });
  it('kreski podziałki bez błędów zaokrągleń', () => {
    expect(ticks(0, 0.5, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(ticks(-2, 2, 1)).toEqual([-2, -1, 0, 1, 2]);
  });
  it('dopasowanie osi do pomiarów (z zerem, gdy dane są blisko)', () => {
    const r = fitToData({ series: [{ name: '', color: '', line: true, markers: true, points: [[0.5, 12], [3.2, 47]] }], xMin: 0, xMax: 1, yMin: 0, yMax: 1 })!;
    expect(r.xMin).toBe(0);
    expect(r.xMax).toBeGreaterThanOrEqual(3.2);
    expect(r.yMin).toBe(0);
    expect(r.yMax).toBeGreaterThanOrEqual(47);
  });
});

const el = (kind: CircuitEl['kind'], a: [number, number], b: [number, number], label?: string): CircuitEl => ({ id: Math.random().toString(), kind, a, b, label });

describe('schemat obwodu', () => {
  it('kolejne podpisy elementów', () => {
    const els = [el('R', [0, 0], [10, 0], 'R1'), el('R', [0, 0], [10, 0], 'R3')];
    expect(nextLabel(els, 'R')).toBe('R2');
    expect(nextLabel(els, 'V')).toBe('E1');
    expect(nextLabel(els, 'wire')).toBeUndefined();
  });
  it('kropka w rozgałęzieniu typu T i przy 3 końcówkach', () => {
    const els = [el('wire', [0, 0], [20, 0]), el('R', [10, 0], [10, 15]), el('wire', [20, 0], [30, 0]), el('C', [20, 0], [20, 10])];
    const j = junctions(els).map((p) => p.join(',')).sort();
    expect(j).toEqual(['10,0', '20,0']);
  });
  it('masa w środku przewodu dostaje kropkę, w narożniku – nie', () => {
    const els = [el('wire', [0, 20], [40, 20]), el('wire', [40, 20], [40, 0]), el('ground', [20, 20], [20, 20]), el('ground', [40, 20], [40, 20])];
    expect(junctions(els).map((p) => p.join(','))).toEqual(['20,20']);
  });

  it('normalizacja przesuwa schemat do początku układu', () => {
    const n = normalize([el('R', [50, 40], [60, 40])]);
    expect(n.dx).toBe(40);
    expect(n.elements[0].a).toEqual([10, 10]);
  });
});

describe('ćwiartki układu', () => {
  const base = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, w: 110, h: 110 } as PlotObj;
  it('tylko I ćwiartka: 0…5 i dwa razy mniejszy obiekt (skala 1 cm bez zmian)', () => {
    expect(applyQuadrants(base, 'I')).toEqual({ xMin: 0, xMax: 5, yMin: 0, yMax: 5, w: 60, h: 60 });
  });
  it('I + IV: oś Y w całości, X tylko dodatni', () => {
    expect(applyQuadrants(base, 'I+IV')).toMatchObject({ xMin: 0, yMin: -5, w: 60, h: 110 });
  });
  it('powrót do wszystkich ćwiartek z I', () => {
    const one = { ...base, ...applyQuadrants(base, 'I') };
    expect(applyQuadrants(one, 'all')).toMatchObject({ xMin: -5, xMax: 5, w: 110 });
    expect(quadrantsOf(one)).toBe('I');
  });
  it('za duży układ zmniejsza skalę, żeby zmieścić się na kartce', () => {
    const big = { ...base, xMin: 0, xMax: 15, yMin: 0, yMax: 10, w: 160, h: 110 } as PlotObj;
    expect(applyQuadrants(big, 'all').w).toBeLessThanOrEqual(200);
  });
});
