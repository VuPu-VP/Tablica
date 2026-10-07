import type { Point } from '../db/types';
import { bboxOf, distToSegment } from './geometry';

// Prostowanie kształtów: narysuj krzywe kółko, przytrzymaj rysik na końcu – zamienia się w idealne.

export type ShapeKind = 'line' | 'circle' | 'ellipse' | 'triangle' | 'rectangle' | 'quad';

type XY = [number, number];

const P = 0.5; // stały nacisk = równa grubość linii kształtu

function pathLength(pts: XY[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** Upraszczanie łamanej (Ramer–Douglas–Peucker): zostawia tylko „narożniki”. */
export function rdp(pts: XY[], eps: number): XY[] {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

/** Gęste punkty wzdłuż łamanej (co ~1 mm) – perfect-freehand potrzebuje ich do równej linii. */
function densify(vertices: XY[], step = 1): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < vertices.length; i++) {
    const [ax, ay] = vertices[i - 1];
    const [bx, by] = vertices[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, P]);
  }
  const last = vertices[vertices.length - 1];
  out.push([last[0], last[1], P]);
  return out;
}

/** Przyciąga kąt do 0°/15°/30°/…/90°, jeśli jest bliżej niż `tol` stopni. */
export function snapAngle(ax: number, ay: number, bx: number, by: number, tol = 4): XY {
  const len = Math.hypot(bx - ax, by - ay);
  const ang = Math.atan2(by - ay, bx - ax);
  const step = Math.PI / 12;
  const snapped = Math.round(ang / step) * step;
  if (Math.abs(snapped - ang) > (tol * Math.PI) / 180) return [bx, by];
  return [ax + Math.cos(snapped) * len, ay + Math.sin(snapped) * len];
}

/** Prosta linia z punktów (linijka). */
export function straightLine(a: XY, b: XY): Point[] {
  return densify([a, snapAngle(a[0], a[1], b[0], b[1])]);
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number): Point[] {
  const n = Math.max(48, Math.ceil((Math.PI * (rx + ry)) / 1));
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, P]);
  }
  return out;
}

/** Średnia odległość punktów od zamkniętego wielokąta. */
function polygonError(pts: XY[], poly: XY[]): number {
  let sum = 0;
  for (const [x, y] of pts) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      best = Math.min(best, distToSegment(x, y, a[0], a[1], b[0], b[1]));
    }
    sum += best;
  }
  return sum / pts.length;
}

const angleAt = (p: XY, a: XY, b: XY) => {
  const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
  return Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1])))));
};

export function recognizeShape(points: Point[]): { kind: ShapeKind; points: Point[] } | null {
  if (points.length < 4) return null;
  const pts: XY[] = points.map((p) => [p[0], p[1]]);
  const len = pathLength(pts);
  if (len < 4) return null; // za małe (< 4 mm), to raczej kropka albo przecinek
  const a = pts[0], b = pts[pts.length - 1];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);

  // --- linia ---
  let maxDev = 0;
  for (const [x, y] of pts) maxDev = Math.max(maxDev, distToSegment(x, y, a[0], a[1], b[0], b[1]));
  if (chord > len * 0.85 && maxDev < Math.max(0.8, chord * 0.06)) {
    return { kind: 'line', points: straightLine(a, b) };
  }

  // --- figury zamknięte ---
  const bb = bboxOf(points);
  const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
  const diag = Math.hypot(w, h);
  if (chord > Math.max(0.25 * diag, 3)) return null; // kreska nie wraca do początku

  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  const rx = w / 2, ry = h / 2;
  if (rx < 1 || ry < 1) return null;
  let eErr = 0;
  for (const [x, y] of pts) eErr += Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1);
  eErr /= pts.length;

  // wierzchołki: upraszczamy zamkniętą łamaną i scalamy koniec z początkiem
  let verts = rdp([...pts, a], diag * 0.09);
  verts = verts.slice(0, -1);
  if (verts.length > 1) {
    const f = verts[0], l = verts[verts.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < diag * 0.15) verts = verts.slice(0, -1);
  }
  const pErr = verts.length >= 3 ? polygonError(pts, verts) / diag : Infinity;

  if ((verts.length === 3 || verts.length === 4) && pErr < 0.035 && pErr < eErr * 0.6) {
    if (verts.length === 3) return { kind: 'triangle', points: densify([...verts, verts[0]]) };
    const angles = verts.map((v, i) => angleAt(v, verts[(i + 3) % 4], verts[(i + 1) % 4]));
    const rightish = angles.every((t) => Math.abs(t - Math.PI / 2) < (20 * Math.PI) / 180);
    const edgesAxis = verts.every((v, i) => {
      const n = verts[(i + 1) % 4];
      const ang = Math.abs(Math.atan2(n[1] - v[1], n[0] - v[0])) % (Math.PI / 2);
      return Math.min(ang, Math.PI / 2 - ang) < (12 * Math.PI) / 180;
    });
    if (rightish && edgesAxis) {
      const r: XY[] = [[bb.minX, bb.minY], [bb.maxX, bb.minY], [bb.maxX, bb.maxY], [bb.minX, bb.maxY], [bb.minX, bb.minY]];
      return { kind: 'rectangle', points: densify(r) };
    }
    return { kind: 'quad', points: densify([...verts, verts[0]]) };
  }

  if (eErr < 0.1) {
    if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.15) {
      const r = (rx + ry) / 2;
      return { kind: 'circle', points: ellipsePoints(cx, cy, r, r) };
    }
    return { kind: 'ellipse', points: ellipsePoints(cx, cy, rx, ry) };
  }
  return null;
}
