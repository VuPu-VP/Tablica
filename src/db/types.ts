// Model danych. Wszystkie współrzędne na stronie są w milimetrach (A4 = 210 × 297 mm),
// więc rysunek nie zależy od rozdzielczości ekranu ani powiększenia.

export type ID = string;

/** Pola wspólne dla wszystkiego, co synchronizujemy. */
export interface Base {
  id: ID;
  /** Czas ostatniej zmiany (ms) – przy synchronizacji wygrywa nowszy. */
  updatedAt: number;
  /** „Nagrobek”: zamiast kasować rekord, oznaczamy go jako usunięty, żeby inne urządzenia się o tym dowiedziały. */
  deleted: 0 | 1;
  /** 1 = zmienione lokalnie, jeszcze niewysłane na Google Drive. (0/1 zamiast boolean, bo IndexedDB nie indeksuje booleanów.) */
  dirty: 0 | 1;
}

export interface Subject extends Base {
  name: string;
  color: string;
  /** Klucz frakcyjny (np. "a0", "a0V") – sortowanie bez przenumerowywania. */
  order: string;
}

export interface Notebook extends Base {
  subjectId: ID;
  name: string;
  order: string;
}

export type Background = 'grid' | 'dots' | 'blank';

export interface Page extends Base {
  notebookId: ID;
  order: string;
  background: Background;
  /** Strona zaimportowana z PDF: wyrenderowana strona PDF (obraz) jest tłem kartki. */
  pdf?: { blobId: ID; pageIndex: number; /** wysokość/szerokość strony PDF */ aspect?: number; name?: string };
}

/** [x mm, y mm, nacisk 0..1] */
export type Point = [number, number, number];

interface ObjectBase extends Base {
  pageId: ID;
  /** Kolejność rysowania (większe = wyżej). */
  z: number;
}

export interface StrokeObj extends ObjectBase {
  type: 'stroke';
  tool: 'pen' | 'highlighter';
  color: string;
  /** Grubość w mm. */
  width: number;
  points: Point[];
  /** Czy nacisk pochodzi z rysika (true), czy ma być symulowany (mysz/palec). */
  pressure: boolean;
}

export interface TextObj extends ObjectBase {
  type: 'text';
  x: number;
  y: number;
  w: number;
  /** Treść w formacie JSON edytora (TipTap/ProseMirror). */
  doc: unknown;
}

export interface ImageObj extends ObjectBase {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  blobId: ID;
}

/** Seria danych na wykresie (np. pomiary z laboratorium). */
export interface PlotSeries {
  name: string;
  color: string;
  points: [number, number][];
  line: boolean;
  markers: boolean;
}

/** Układ współrzędnych (pusty do rysowania rysikiem albo z punktami z tabeli). */
export interface PlotObj extends ObjectBase {
  type: 'plot';
  x: number;
  y: number;
  /** rozmiar obszaru wykresu w mm */
  w: number;
  h: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** odstęp podziałki w jednostkach osi */
  xStep: number;
  yStep: number;
  xLabel: string;
  yLabel: string;
  grid: boolean;
  numbers: boolean;
  series: PlotSeries[];
}

export type GateKind = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR' | 'XNOR' | 'BUF';

export type CircuitKind =
  | 'wire' | 'R' | 'L' | 'C' | 'V' | 'I' | 'AC' | 'battery'
  | 'switch' | 'diode' | 'lamp' | 'ammeter' | 'voltmeter' | 'ground' | 'node'
  | GateKind
  /** wejście / wyjście układu cyfrowego (punkt z podpisem A, B… / Y) */
  | 'in' | 'out';

/**
 * Element schematu: od punktu a do b (mm względem początku schematu).
 * Elementy punktowe (masa, węzeł, bramki, wejścia/wyjścia): a = b (dla bramki – środek symbolu).
 */
export interface CircuitEl {
  id: ID;
  kind: CircuitKind;
  a: [number, number];
  b: [number, number];
  label?: string;
  /** liczba wejść bramki (2–4) */
  inputs?: number;
}

/** Schemat obwodu (symbole IEC 60617). */
export interface CircuitObj extends ObjectBase {
  type: 'circuit';
  x: number;
  y: number;
  w: number;
  h: number;
  /** skala (zmienia się przy skalowaniu lassem) */
  s: number;
  elements: CircuitEl[];
  /** styl symboli bramek: prostokąty IEC (domyślnie) albo kształty ANSI */
  gateStyle?: 'iec' | 'ansi';
}

export type PageObject = StrokeObj | TextObj | ImageObj | PlotObj | CircuitObj;
/** Obiekty z prostokątem (x, y, w, h) – zdjęcia, wykresy, schematy. */
export type BoxObj = ImageObj | PlotObj | CircuitObj;

export interface StoredBlob {
  id: ID;
  mime: string;
  data: Blob;
  hash: string;
}

export const PAGE_W = 210;
export const PAGE_H = 297;
