import { describe, expect, it } from 'vitest';
import type { Point } from '../src/db/types';
import { eraseFromStroke } from '../src/ink/eraser';
import { distToSegment, pointInPolygon, strokeHit } from '../src/ink/geometry';

const line = (x0: number, x1: number, y = 0, step = 1): Point[] => {
  const pts: Point[] = [];
  for (let x = x0; x <= x1; x += step) pts.push([x, y, 0.5]);
  return pts;
};

describe('geometria', () => {
  it('odległość od odcinka', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBeCloseTo(5); // poza końcem → do punktu A
  });

  it('trafienie kreski uwzględnia jej grubość', () => {
    const s = { points: line(0, 10), width: 2 };
    expect(strokeHit(s, 5, 1.9, 1)).toBe(true); // 1.9 ≤ r(1) + width/2(1)
    expect(strokeHit(s, 5, 2.1, 1)).toBe(false);
  });

  it('punkt w wielokącie (lasso)', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });
});

describe('gumka częściowa', () => {
  it('nie zmienia kreski, której nie dotyka', () => {
    expect(eraseFromStroke(line(0, 10), 5, 5, 1)).toBeNull();
  });

  it('dzieli kreskę na dwie części', () => {
    const pieces = eraseFromStroke(line(0, 10), 5, 0, 1)!;
    expect(pieces).toHaveLength(2);
    expect(pieces[0].at(-1)![0]).toBeCloseTo(4); // lewa część kończy się na brzegu koła
    expect(pieces[1][0][0]).toBeCloseTo(6); // prawa zaczyna się na drugim brzegu
  });

  it('przecina kreskę, nawet gdy żaden punkt nie leży w kółku (rzadkie punkty)', () => {
    const sparse: Point[] = [[0, 0, 0.5], [10, 0, 0.5]];
    const pieces = eraseFromStroke(sparse, 5, 0.5, 1)!;
    expect(pieces).toHaveLength(2);
    expect(pieces[0][1][0]).toBeLessThan(5);
    expect(pieces[1][0][0]).toBeGreaterThan(5);
  });

  it('usuwa koniec kreski bez tworzenia pustych kawałków', () => {
    const pieces = eraseFromStroke(line(0, 10), 10, 0, 2)!;
    expect(pieces).toHaveLength(1);
    expect(pieces[0].at(-1)![0]).toBeCloseTo(8);
  });

  it('kasuje całą kreskę, gdy kółko ją obejmuje', () => {
    expect(eraseFromStroke(line(0, 2), 1, 0, 5)).toEqual([]);
  });

  it('interpoluje nacisk w punkcie cięcia', () => {
    const pts: Point[] = [[0, 0, 0], [10, 0, 1]];
    const pieces = eraseFromStroke(pts, 5, 0, 1)!;
    expect(pieces[0][1][2]).toBeCloseTo(0.4);
    expect(pieces[1][0][2]).toBeCloseTo(0.6);
  });
});
