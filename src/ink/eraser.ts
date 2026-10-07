import type { Point } from '../db/types';

/**
 * Gumka częściowa: wycina z kreski fragment znajdujący się w kółku (cx, cy, r).
 * Zwraca listę pozostałych kawałków albo `null`, jeśli kółko kreski nie dotknęło.
 *
 * Dla każdego odcinka A→B liczymy, na jakim jego fragmencie (parametr t ∈ [0,1]) leży
 * wnętrze koła. Dzięki temu gumka przecina kreskę nawet wtedy, gdy żaden zapisany punkt
 * nie leży w kółku (szybki ruch rysikiem = rzadkie punkty).
 */
export function eraseFromStroke(points: Point[], cx: number, cy: number, r: number): Point[][] | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return Math.hypot(points[0][0] - cx, points[0][1] - cy) <= r ? [] : null;
  }

  const pieces: Point[][] = [];
  let current: Point[] = [];
  let changed = false;

  const inside = (p: Point) => Math.hypot(p[0] - cx, p[1] - cy) <= r;
  if (!inside(points[0])) current.push(points[0]);
  else changed = true;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const hit = circleInterval(a, b, cx, cy, r);
    if (!hit) {
      current.push(b);
      continue;
    }
    changed = true;
    const [t1, t2] = hit;
    if (t1 > 0) current.push(lerp(a, b, t1));
    if (current.length >= 2) pieces.push(current);
    current = [];
    if (t2 < 1) current.push(lerp(a, b, t2), b);
  }
  if (current.length >= 2) pieces.push(current);
  return changed ? pieces : null;
}

/** Fragment [t1, t2] odcinka A→B leżący wewnątrz koła, albo null. */
function circleInterval(a: Point, b: Point, cx: number, cy: number, r: number): [number, number] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fx = a[0] - cx;
  const fy = a[1] - cy;
  const A = dx * dx + dy * dy;
  const C = fx * fx + fy * fy - r * r;
  if (A === 0) return C <= 0 ? [0, 1] : null;
  const B = 2 * (fx * dx + fy * dy);
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = Math.max(0, (-B - s) / (2 * A));
  const t2 = Math.min(1, (-B + s) / (2 * A));
  return t1 < t2 || (t1 === t2 && C <= 0) ? [t1, t2] : null;
}

const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
