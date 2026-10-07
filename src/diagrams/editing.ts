import { newId, nextZ } from '../db/repo';
import type { CircuitObj, ID, PlotObj } from '../db/types';

// Który wykres/schemat jest właśnie edytowany (okno edytora wyświetla Editor).
export type DiagramObj = PlotObj | CircuitObj;
type Editing = { obj: DiagramObj; isNew: boolean } | null;

let current: Editing = null;
/** Nowy obiekt czekający na wskazanie miejsca na kartce (podgląd idzie za kursorem/rysikiem). */
let placing: DiagramObj | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const diagramEditing = {
  get: () => current,
  getPlacing: () => placing,
  open(obj: DiagramObj, isNew = false) { current = { obj, isNew }; placing = null; emit(); },
  close() { current = null; emit(); },
  startPlacing(obj: DiagramObj) { current = null; placing = obj; emit(); },
  stopPlacing() { placing = null; emit(); },
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
};

/**
 * Położenie obiektu po kliknięciu w (px, py) mm: środek obiektu pod kursorem,
 * lewy górny róg na linii kratki (5 mm), cały obiekt w obrębie kartki.
 */
export function placeAt(obj: DiagramObj, px: number, py: number, pageW = 210, pageH = 297) {
  const x = Math.min(Math.max(0, snap5(px - obj.w / 2)), Math.max(0, Math.floor((pageW - obj.w) / 5) * 5));
  const y = Math.min(Math.max(0, snap5(py - obj.h / 2)), Math.max(0, Math.floor((pageH - obj.h) / 5) * 5));
  return { x, y };
}

const snap5 = (v: number) => Math.round(v / 5) * 5;
const meta = (pageId: ID) => ({ id: newId(), pageId, z: nextZ(), updatedAt: 0, deleted: 0 as const, dirty: 1 as const });

/** Nowy układ współrzędnych: −5…5 na obu osiach, 1 jednostka = 1 cm, osie na liniach kratki. */
export const newPlot = (pageId: ID, y: number): PlotObj => ({
  ...meta(pageId),
  type: 'plot',
  x: 50,
  y: snap5(y),
  w: 110,
  h: 110,
  xMin: -5, xMax: 5, yMin: -5, yMax: 5,
  xStep: 1, yStep: 1,
  xLabel: 'x', yLabel: 'y',
  grid: true,
  numbers: true,
  series: [],
});

export const newCircuit = (pageId: ID, y: number): CircuitObj => ({
  ...meta(pageId),
  type: 'circuit',
  x: 25,
  y: snap5(y),
  w: 160,
  h: 80,
  s: 1,
  elements: [],
});
