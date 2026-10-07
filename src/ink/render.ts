import { getStroke } from 'perfect-freehand';
import type { PageObject, Point, StrokeObj } from '../db/types';
import { plainText } from '../text/extensions';
import { gateGeom, isGate } from '../diagrams/circuit';

// Rysujemy w milimetrach: przed wywołaniem tych funkcji kontekst canvasu ma ustawioną
// skalę (px na mm × gęstość ekranu), więc tu nie przejmujemy się rozdzielczością.

type StrokeLike = Pick<StrokeObj, 'tool' | 'width' | 'points' | 'pressure'>;

/** perfect-freehand zamienia listę punktów z naciskiem w obrys (wielokąt) o zmiennej grubości. */
export function strokeOutline(s: StrokeLike, last = true): number[][] {
  if (s.tool === 'highlighter') {
    return getStroke(s.points, {
      size: s.width,
      thinning: 0,
      smoothing: 0.6,
      streamline: 0.5,
      simulatePressure: false,
      start: { cap: true },
      end: { cap: true },
      last,
    });
  }
  return getStroke(s.points, {
    size: s.width * 1.5,
    thinning: s.pressure ? 0.6 : 0.5,
    smoothing: 0.55,
    streamline: 0.35,
    simulatePressure: !s.pressure,
    last,
  });
}

export function pathFromOutline(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n < 2) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % n];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

/** Ten sam obrys jako ścieżka SVG (wektor do PDF – ostry przy każdym powiększeniu). */
export function svgPathFromOutline(outline: number[][]): string {
  const n = outline.length;
  if (n < 2) return '';
  const f = (v: number) => v.toFixed(2);
  let d = `M${f(outline[0][0])} ${f(outline[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % n];
    d += `Q${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
  }
  return d + 'Z';
}

// Obrys liczymy raz na wersję kreski – przy przewijaniu i zoomie tylko go przerysowujemy.
const cache = new Map<string, { v: number; path: Path2D }>();

function cachedPath(s: StrokeObj): Path2D {
  const hit = cache.get(s.id);
  if (hit && hit.v === s.updatedAt) return hit.path;
  const path = pathFromOutline(strokeOutline(s));
  cache.set(s.id, { v: s.updatedAt, path });
  if (cache.size > 20000) cache.delete(cache.keys().next().value!);
  return path;
}

export function fillStroke(ctx: CanvasRenderingContext2D, s: StrokeLike, path: Path2D) {
  ctx.save();
  if (s.tool === 'highlighter') {
    // „multiply” jak prawdziwy zakreślacz: tekst pod spodem pozostaje czytelny
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.55;
  }
  ctx.fillStyle = (s as StrokeObj).color;
  ctx.fill(path);
  ctx.restore();
}

/** Rysuje wszystkie kreski strony: najpierw zakreślacze, potem pióro (pismo zawsze nad zakreśleniem). */
export function drawStrokes(ctx: CanvasRenderingContext2D, objects: PageObject[]) {
  const strokes = objects.filter((o): o is StrokeObj => o.type === 'stroke');
  for (const s of strokes) if (s.tool === 'highlighter') fillStroke(ctx, s, cachedPath(s));
  for (const s of strokes) if (s.tool === 'pen') fillStroke(ctx, s, cachedPath(s));
}

/** Zdjęcia w miniaturach jako szare prostokąty (pełne obrazy byłyby za ciężkie). */
export function drawImagePlaceholders(ctx: CanvasRenderingContext2D, objects: PageObject[]) {
  ctx.save();
  ctx.fillStyle = '#d9dee6';
  for (const o of objects) if (o.type === 'image') ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.restore();
}

/** Wykresy i schematy w miniaturach: osie / przewody jako cienkie linie. */
export function drawDiagramsApprox(ctx: CanvasRenderingContext2D, objects: PageObject[]) {
  ctx.save();
  ctx.strokeStyle = '#1b1c1f';
  ctx.lineWidth = 0.5;
  for (const o of objects) {
    ctx.beginPath();
    if (o.type === 'plot') {
      const ax = o.x + 5 + ((Math.min(Math.max(0, o.xMin), o.xMax) - o.xMin) / (o.xMax - o.xMin)) * (o.w - 10);
      const ay = o.y + o.h - 5 - ((Math.min(Math.max(0, o.yMin), o.yMax) - o.yMin) / (o.yMax - o.yMin)) * (o.h - 10);
      ctx.moveTo(o.x + 5, ay); ctx.lineTo(o.x + o.w - 1, ay);
      ctx.moveTo(ax, o.y + o.h - 5); ctx.lineTo(ax, o.y + 1);
    } else if (o.type === 'circuit') {
      const s = o.s || 1;
      for (const e of o.elements) {
        if (isGate(e.kind)) {
          // bramka w miniaturze: prostokąt
          const h = gateGeom(e).h;
          ctx.rect(o.x + (e.a[0] - 5) * s, o.y + (e.a[1] - h / 2) * s, 10 * s, h * s);
          continue;
        }
        ctx.moveTo(o.x + e.a[0] * s, o.y + e.a[1] * s);
        ctx.lineTo(o.x + e.b[0] * s, o.y + e.b[1] * s);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Przybliżony tekst (do miniatur): zwykły tekst bez formatowania, wiersze co 5 mm. */
export function drawTextsApprox(ctx: CanvasRenderingContext2D, objects: PageObject[]) {
  ctx.save();
  ctx.fillStyle = '#1b1c1f';
  ctx.font = '3.7px "Inter Variable", sans-serif';
  ctx.textBaseline = 'alphabetic';
  for (const o of objects) {
    if (o.type !== 'text') continue;
    plainText(o.doc).forEach((line, i) => ctx.fillText(line, o.x, o.y + 3.9 + i * 5, o.w));
  }
  ctx.restore();
}

/** Kreska w trakcie rysowania (bez cache, z punktami przewidywanymi). */
export function drawLiveStroke(ctx: CanvasRenderingContext2D, s: StrokeLike & { color: string }, extra: Point[] = []) {
  const pts = extra.length ? [...s.points, ...extra] : s.points;
  fillStroke(ctx, s, pathFromOutline(strokeOutline({ ...s, points: pts }, false)));
}
