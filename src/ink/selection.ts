import type { ID, PageObject } from '../db/types';
import { bboxOf, pointInPolygon, type BBox } from './geometry';

// Lasso: co zaznaczyć, jaki prostokąt obejmuje zaznaczenie i jak przesuwać/skalować obiekty.

/** Wysokość bloku tekstu w mm (mierzona z DOM, bo zależy od zawijania). */
export type TextHeights = Map<ID, number>;

const textHeight = (o: PageObject, h?: TextHeights) => h?.get(o.id) ?? 5;

export function selectInPolygon(objects: PageObject[], poly: [number, number][], heights?: TextHeights): ID[] {
  if (poly.length < 3) return [];
  const ids: ID[] = [];
  for (const o of objects) {
    if (o.type === 'stroke') {
      // kreska jest zaznaczona, jeśli co najmniej połowa jej punktów leży w lassie
      let inside = 0;
      for (const p of o.points) if (pointInPolygon(p[0], p[1], poly)) inside++;
      if (inside >= Math.max(1, o.points.length / 2)) ids.push(o.id);
    } else if (o.type === 'text') {
      if (pointInPolygon(o.x + Math.min(o.w, 20) / 2, o.y + textHeight(o, heights) / 2, poly)) ids.push(o.id);
    } else if (pointInPolygon(o.x + o.w / 2, o.y + o.h / 2, poly)) ids.push(o.id);
  }
  return ids;
}

export function objectsBBox(objects: PageObject[], heights?: TextHeights): BBox | null {
  if (!objects.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objects) {
    let b: BBox;
    if (o.type === 'stroke') b = bboxOf(o.points, o.width / 2);
    else if (o.type === 'text') b = { minX: o.x, minY: o.y, maxX: o.x + o.w, maxY: o.y + textHeight(o, heights) };
    else b = { minX: o.x, minY: o.y, maxX: o.x + o.w, maxY: o.y + o.h };
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}

/** Przesunięcie i skalowanie względem punktu (ox, oy): x' = ox + (x - ox)·s + dx. */
export function transformObject(o: PageObject, dx: number, dy: number, s = 1, ox = 0, oy = 0): PageObject {
  const tx = (x: number) => ox + (x - ox) * s + dx;
  const ty = (y: number) => oy + (y - oy) * s + dy;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  if (o.type === 'stroke') {
    return { ...o, width: r2(o.width * s), points: o.points.map(([x, y, p]) => [r2(tx(x)), r2(ty(y)), p]) };
  }
  if (o.type === 'text') return { ...o, x: r2(tx(o.x)), y: r2(ty(o.y)), w: r2(Math.max(10, o.w * s)) };
  const box = { ...o, x: r2(tx(o.x)), y: r2(ty(o.y)), w: r2(o.w * s), h: r2(o.h * s) };
  // schemat: symbole skalują się razem z obiektem
  return box.type === 'circuit' ? { ...box, s: (box.s || 1) * s } : box;
}
