import type { CircuitEl, CircuitKind, GateKind } from '../db/types';
import { distToSegment } from '../ink/geometry';

/** Siatka schematu: 2,5 mm (połowa kratki kartki). */
export const GRID = 2.5;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

export const GATES: GateKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'BUF'];
export const isGate = (k: CircuitKind): k is GateKind => (GATES as CircuitKind[]).includes(k);
/** Bramki z jednym wejściem. */
export const ONE_INPUT: GateKind[] = ['NOT', 'BUF'];

/** Elementy stawiane jednym kliknięciem (a = b). */
export const SINGLE_POINT: CircuitKind[] = ['ground', 'node', 'in', 'out', ...GATES];

/**
 * Geometria bramki (mm względem środka a): wejścia na lewej krawędzi, wyjście na prawej –
 * wszystkie wyprowadzenia na siatce 2,5 mm, żeby przewody trafiały w nie same.
 */
export function gateGeom(e: Pick<CircuitEl, 'kind' | 'a' | 'inputs'>) {
  const n = ONE_INPUT.includes(e.kind as GateKind) ? 1 : Math.min(4, Math.max(2, e.inputs ?? 2));
  const h = Math.max(10, n * 5);
  const [x, y] = e.a;
  const ins: [number, number][] = Array.from({ length: n }, (_, i) => [x - 7.5, y + (i - (n - 1) / 2) * 5]);
  return { n, h, ins, out: [x + 7.5, y] as [number, number] };
}

/** Wyprowadzenia elementu (do wykrywania węzłów). */
function pins(e: CircuitEl): [number, number][] {
  if (isGate(e.kind)) { const g = gateGeom(e); return [...g.ins, g.out]; }
  if (e.kind === 'in' || e.kind === 'out') return [e.a];
  return [e.a, e.b];
}

/** Prefiks automatycznego podpisu (R1, L2, C1, E1…). Przewody, masa, węzły i bramki – bez podpisu. */
export const LABEL_PREFIX: Partial<Record<CircuitKind, string>> = {
  R: 'R', L: 'L', C: 'C', V: 'E', I: 'J', AC: 'e', battery: 'U', switch: 'S', diode: 'D', lamp: 'Ż', ammeter: 'A', voltmeter: 'V',
};

export function nextLabel(elements: CircuitEl[], kind: CircuitKind): string | undefined {
  const used = new Set(elements.filter((e) => e.kind === kind).map((e) => e.label));
  // wejścia układu cyfrowego: A, B, C…; wyjścia: Y, Y1, Y2…
  if (kind === 'in') {
    for (const c of 'ABCDEFGHIJKLMNOPRSTUW') if (!used.has(c)) return c;
    return undefined;
  }
  if (kind === 'out') {
    if (!used.has('Y')) return 'Y';
    let n = 1;
    while (used.has('Y' + n)) n++;
    return 'Y' + n;
  }
  const prefix = LABEL_PREFIX[kind];
  if (!prefix || kind === 'ammeter' || kind === 'voltmeter') return undefined;
  const nums = new Set(elements.filter((e) => e.kind === kind).map((e) => e.label?.match(/^\D+(\d+)/)?.[1]).filter(Boolean));
  let n = 1;
  while (nums.has(String(n))) n++;
  return prefix + n;
}

/** Odległość punktu od elementu (do klikania w edytorze). */
export function hitDistance(e: CircuitEl, x: number, y: number): number {
  if (isGate(e.kind)) {
    const g = gateGeom(e);
    return Math.hypot(Math.max(0, Math.abs(x - e.a[0]) - 7.5), Math.max(0, Math.abs(y - e.a[1]) - g.h / 2));
  }
  if (e.a[0] === e.b[0] && e.a[1] === e.b[1]) {
    const cy = e.kind === 'ground' ? e.a[1] + 3 : e.a[1];
    return Math.hypot(x - e.a[0], y - cy);
  }
  return distToSegment(x, y, e.a[0], e.a[1], e.b[0], e.b[1]);
}

const key = (p: [number, number]) => `${p[0]},${p[1]}`;

/**
 * Węzły (kropki) rysujemy tam, gdzie spotykają się 3 lub więcej końcówek
 * albo końcówka trafia w środek przewodu (rozgałęzienie typu T).
 */
export function junctions(elements: CircuitEl[]): [number, number][] {
  const count = new Map<string, number>();
  const ends: [number, number][] = [];
  for (const e of elements) {
    if (e.kind === 'node') continue;
    // masa podpięta w środku przewodu to też rozgałęzienie (T), ale w narożniku kropki nie potrzebuje
    if (e.kind === 'ground') { ends.push(e.a); continue; }
    for (const p of pins(e)) { count.set(key(p), (count.get(key(p)) ?? 0) + 1); ends.push(p); }
  }
  const out = new Map<string, [number, number]>();
  for (const [k, c] of count) if (c >= 3) out.set(k, k.split(',').map(Number) as [number, number]);
  // końcówka na środku przewodu
  for (const p of ends) {
    for (const w of elements) {
      if (w.kind !== 'wire') continue;
      if (key(p) === key(w.a) || key(p) === key(w.b)) continue;
      if (distToSegment(p[0], p[1], w.a[0], w.a[1], w.b[0], w.b[1]) < 0.01) out.set(key(p), p);
    }
  }
  return [...out.values()];
}

/** Prostokąt obejmujący schemat (z zapasem na symbole i podpisy). */
export function circuitBounds(elements: CircuitEl[], pad = 8.5) {
  if (!elements.length) return { minX: 0, minY: 0, maxX: 40, maxY: 30 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const e of elements) {
    if (isGate(e.kind)) {
      const g = gateGeom(e);
      add(e.a[0] - 7.5, e.a[1] - g.h / 2);
      add(e.a[0] + 7.5, e.a[1] + g.h / 2);
    } else {
      add(...e.a);
      add(...e.b);
    }
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Przesuwa elementy tak, żeby schemat zaczynał się w (0, 0); zwraca przesunięcie (do poprawienia x, y obiektu). */
export function normalize(elements: CircuitEl[]) {
  const b = circuitBounds(elements);
  // w dół do siatki – żeby margines na podpisy nie zmalał
  const dx = Math.floor(b.minX / GRID) * GRID, dy = Math.floor(b.minY / GRID) * GRID;
  const shifted = elements.map((e) => ({ ...e, a: [e.a[0] - dx, e.a[1] - dy] as [number, number], b: [e.b[0] - dx, e.b[1] - dy] as [number, number] }));
  return { elements: shifted, dx, dy, w: b.maxX - dx, h: b.maxY - dy };
}
