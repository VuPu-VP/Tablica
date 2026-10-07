import { describe, expect, it } from 'vitest';
import type { CircuitEl } from '../src/db/types';
import { circuitBounds, gateGeom, hitDistance, junctions, nextLabel } from '../src/diagrams/circuit';

const el = (kind: CircuitEl['kind'], a: [number, number], b: [number, number] = a, extra: Partial<CircuitEl> = {}): CircuitEl =>
  ({ id: Math.random().toString(), kind, a, b, ...extra });

describe('bramki logiczne', () => {
  it('wyprowadzenia leżą na siatce 2,5 mm (przewody trafiają w nie same)', () => {
    for (const n of [2, 3, 4]) {
      const g = gateGeom(el('AND', [20, 20], [20, 20], { inputs: n }));
      expect(g.ins).toHaveLength(n);
      for (const [x, y] of [...g.ins, g.out]) {
        expect((x / 2.5) % 1).toBe(0);
        expect((y / 2.5) % 1).toBe(0);
      }
    }
  });

  it('NOT i bufor mają jedno wejście na wysokości wyjścia', () => {
    const g = gateGeom(el('NOT', [10, 10], [10, 10], { inputs: 3 }));
    expect(g.ins).toEqual([[2.5, 10]]);
    expect(g.out).toEqual([17.5, 10]);
  });

  it('więcej wejść = wyższa bramka', () => {
    expect(gateGeom(el('OR', [0, 0], [0, 0], { inputs: 4 })).h).toBe(20);
    expect(gateGeom(el('OR', [0, 0], [0, 0], { inputs: 2 })).h).toBe(10);
  });

  it('kliknięcie w ciało bramki ją trafia', () => {
    const g = el('NAND', [20, 20]);
    expect(hitDistance(g, 22, 21)).toBe(0);
    expect(hitDistance(g, 40, 20)).toBeGreaterThan(5);
  });

  it('podpisy wejść A, B, C… i wyjść Y, Y1…', () => {
    const els = [el('in', [0, 0], [0, 0], { label: 'A' }), el('out', [0, 0], [0, 0], { label: 'Y' })];
    expect(nextLabel(els, 'in')).toBe('B');
    expect(nextLabel(els, 'out')).toBe('Y1');
    expect(nextLabel(els, 'AND')).toBeUndefined();
  });

  it('kropka, gdy wyjście bramki rozgałęzia się na dwa przewody', () => {
    const g = el('AND', [20, 20]); // wyjście w (27.5, 20)
    const els = [g, el('wire', [27.5, 20], [40, 20]), el('wire', [27.5, 20], [27.5, 35])];
    expect(junctions(els).map((p) => p.join(','))).toEqual(['27.5,20']);
  });

  it('obrys schematu obejmuje całą bramkę', () => {
    const b = circuitBounds([el('OR', [50, 50], [50, 50], { inputs: 4 })], 0);
    expect(b).toEqual({ minX: 42.5, minY: 40, maxX: 57.5, maxY: 60 });
  });
});
