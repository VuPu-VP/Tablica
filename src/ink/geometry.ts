import type { Point, StrokeObj } from '../db/types';

/** Odległość punktu P od odcinka AB. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Czy kółko (x, y, r) dotyka kreski – uwzględnia jej grubość. */
export function strokeHit(stroke: Pick<StrokeObj, 'points' | 'width'>, x: number, y: number, r: number): boolean {
  const pts = stroke.points;
  const reach = r + stroke.width / 2;
  if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) <= reach;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= reach) return true;
  }
  return false;
}

export interface BBox { minX: number; minY: number; maxX: number; maxY: number }

export function bboxOf(points: Point[], pad = 0): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Test „punkt w wielokącie” (ray casting) – używany przez lasso. */
export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Zaokrągla punkt do 0,01 mm – mniejsze pliki przy synchronizacji, niewidoczna różnica. */
export const roundPoint = (x: number, y: number, p: number): Point => [
  Math.round(x * 100) / 100,
  Math.round(y * 100) / 100,
  Math.round(p * 100) / 100,
];
