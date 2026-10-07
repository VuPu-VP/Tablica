import { describe, expect, it } from 'vitest';
import type { Point } from '../src/db/types';
import { recognizeShape, snapAngle } from '../src/ink/shapes';

// Pseudolosowe „drżenie ręki”, deterministyczne, żeby testy były powtarzalne.
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const jitter = (pts: [number, number][], amp: number): Point[] => pts.map(([x, y]) => [x + rand() * amp, y + rand() * amp, 0.5]);

const along = (verts: [number, number][], step = 0.7): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 1; i < verts.length; i++) {
    const [ax, ay] = verts[i - 1], [bx, by] = verts[i];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  out.push(verts[verts.length - 1]);
  return out;
};

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 80): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * 2 * Math.PI) * rx, cy + Math.sin((i / n) * 2 * Math.PI) * ry]);

describe('rozpoznawanie kształtów', () => {
  it('lekko krzywa linia → linia', () => {
    expect(recognizeShape(jitter(along([[10, 10], [80, 14]]), 0.6))?.kind).toBe('line');
  });

  it('krzywe kółko → okrąg', () => {
    expect(recognizeShape(jitter(ellipse(50, 50, 20, 21), 1))?.kind).toBe('circle');
  });

  it('spłaszczone kółko → elipsa', () => {
    expect(recognizeShape(jitter(ellipse(50, 50, 30, 15), 1))?.kind).toBe('ellipse');
  });

  it('trójkąt', () => {
    expect(recognizeShape(jitter(along([[10, 60], [40, 10], [70, 60], [10.5, 59]]), 0.8))?.kind).toBe('triangle');
  });

  it('prostokąt → idealny prostokąt równoległy do krawędzi', () => {
    const r = recognizeShape(jitter(along([[10, 10], [70, 11], [69, 50], [11, 49], [10, 11]]), 0.8));
    expect(r?.kind).toBe('rectangle');
  });

  it('esy-floresy (pismo) → nic', () => {
    const scribble = jitter(Array.from({ length: 60 }, (_, i) => [i, 10 + Math.sin(i / 2) * 6] as [number, number]), 0.3);
    expect(recognizeShape(scribble)).toBeNull();
  });

  it('przyciąganie kąta do poziomu', () => {
    const [, y] = snapAngle(0, 0, 100, 3);
    expect(y).toBeCloseTo(0);
    const [, y2] = snapAngle(0, 0, 100, 30); // ~16,7° → mniej niż 4° od 15°, więc przyciąga do 15°
    expect(Math.atan2(y2, 100) * 180 / Math.PI).toBeCloseTo(15, 0);
  });
});
