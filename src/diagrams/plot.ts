import type { PlotObj } from '../db/types';

/** „Ładny” krok podziałki: 1, 2 albo 5 × 10^k, tak żeby wyszło ok. `target` kresek. */
export function niceStep(range: number, target = 10): number {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * pow;
}

const num = (s: string) => Number(s.replace(',', '.'));

/**
 * Dane wklejone z Excela / Arkuszy / notatek: jedna para (x, y) w wierszu.
 * Separatory: tabulator, średnik, spacje. Przecinek dziesiętny („1,5”) jest obsługiwany;
 * gdy w wierszu jest tylko „1,2” bez innych separatorów, przecinek oddziela x od y.
 */
export function parsePoints(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let parts = line.split(/[\t;]+|\s+/).filter(Boolean);
    if (parts.length === 1 && (line.match(/,/g)?.length ?? 0) === 1) parts = line.split(',');
    if (parts.length < 2) continue;
    const x = num(parts[0]);
    const y = num(parts[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}

export const formatPoints = (pts: [number, number][]) =>
  pts.map(([x, y]) => `${String(x).replace('.', ',')}\t${String(y).replace('.', ',')}`).join('\n');

/** Zakres osi obejmujący wszystkie punkty (z marginesem, zaokrąglony do podziałki, zawsze z zerem w pobliżu). */
export function fitToData(p: Pick<PlotObj, 'series' | 'xMin' | 'xMax' | 'yMin' | 'yMax'>) {
  const pts = p.series.flatMap((s) => s.points);
  if (!pts.length) return null;
  const axis = (vals: number[]) => {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo > 0 && lo < (hi - lo) * 0.5) lo = 0; // dane blisko zera → pokaż początek osi
    if (hi < 0 && -hi < (hi - lo) * 0.5) hi = 0;
    if (lo === hi) { lo -= 1; hi += 1; }
    const step = niceStep(hi - lo, 8);
    return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
  };
  const x = axis(pts.map((q) => q[0]));
  const y = axis(pts.map((q) => q[1]));
  return { xMin: x.min, xMax: x.max, xStep: x.step, yMin: y.min, yMax: y.max, yStep: y.step };
}

/** Wartości podziałki od min do max (bez błędów zmiennoprzecinkowych typu 0.30000000000000004). */
export function ticks(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !(max > min)) return [];
  const out: number[] = [];
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + 1e-9 && out.length < 500; k++) {
    out.push(Number((k * step).toFixed(decimals)));
  }
  return out;
}

export const fmtTick = (v: number) => String(v).replace('.', ',').replace('-', '−');

/** Margines wokół obszaru wykresu (mm) – miejsce na liczby, strzałki i opisy osi. */
export const PLOT_MARGIN = 5;

/** Gotowe układy ćwiartek: I (pomiary), I+II (np. parabola), I+IV (np. przebieg w czasie), wszystkie. */
export type Quadrants = 'I' | 'I+II' | 'I+IV' | 'all';

export function quadrantsOf(p: Pick<PlotObj, 'xMin' | 'yMin'>): Quadrants {
  const left = p.xMin < 0, down = p.yMin < 0;
  return left && down ? 'all' : left ? 'I+II' : down ? 'I+IV' : 'I';
}

/**
 * Przełącza ćwiartki, zachowując skalę (mm na jednostkę) i zasięg osi w stronę dodatnią –
 * np. z „−5…5” na „0…5”. Rozmiar obiektu zmienia się odpowiednio (maks. 200 × 270 mm).
 */
export function applyQuadrants(p: PlotObj, q: Quadrants): Partial<PlotObj> {
  const M = PLOT_MARGIN;
  const ux = (p.w - 2 * M) / (p.xMax - p.xMin);
  const uy = (p.h - 2 * M) / (p.yMax - p.yMin);
  const nx = Math.max(Math.abs(p.xMin), Math.abs(p.xMax)) || 5;
  const ny = Math.max(Math.abs(p.yMin), Math.abs(p.yMax)) || 5;
  const left = q === 'I+II' || q === 'all';
  const down = q === 'I+IV' || q === 'all';
  const xMin = left ? -nx : 0, yMin = down ? -ny : 0;
  const k = Math.min(1, (200 - 2 * M) / (ux * (nx - xMin)), (270 - 2 * M) / (uy * (ny - yMin)));
  return {
    xMin, xMax: nx, yMin, yMax: ny,
    w: Math.round((ux * k * (nx - xMin) + 2 * M) * 10) / 10,
    h: Math.round((uy * k * (ny - yMin) + 2 * M) * 10) / 10,
  };
}
