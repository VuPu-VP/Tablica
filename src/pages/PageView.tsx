import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { listObjects, newId, nextZ } from '../db/repo';
import { PAGE_H, PAGE_W, type CircuitObj, type ID, type ImageObj, type Page, type PageObject, type Point, type PlotObj, type StrokeObj, type TextObj } from '../db/types';
import { DiagramLayer, PlaceOverlay } from '../diagrams/DiagramLayer';
import { diagramEditing } from '../diagrams/editing';
import { imageEditing } from '../import/ImageEditor';
import { touchState } from '../editor/gestures';
import { PEN_COLORS, type ToolSettings } from '../editor/tools';
import { clipboard } from '../ink/clipboard';
import { eraseFromStroke } from '../ink/eraser';
import { bboxOf, roundPoint, strokeHit } from '../ink/geometry';
import { history } from '../ink/history';
import { drawLiveStroke, drawStrokes } from '../ink/render';
import { objectsBBox, selectInPolygon, transformObject, type TextHeights } from '../ink/selection';
import { recognizeShape, straightLine } from '../ink/shapes';
import { TextLayer } from '../text/TextLayer';
import { backgroundStyle } from './background';
import { ImageLayer, PdfBackground } from './ImageLayer';

const EMPTY: PageObject[] = [];
const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);
// iOS ogranicza łączny rozmiar canvasów – na telefonie oszczędzamy pikseli.
const MAX_PIXELS = isIOS ? 5e6 : 10e6;
/** Ile ms trzeba przytrzymać rysik na końcu kreski, żeby się „wyprostowała”. */
const HOLD_MS = 450;

/** Gęstość pikseli canvasu: ostrość na ekranach HiDPI, ale z limitem pamięci. */
function canvasDpr(cssW: number, cssH: number) {
  const want = window.devicePixelRatio || 1;
  return Math.min(want, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
}

type LiveStroke = Pick<StrokeObj, 'tool' | 'color' | 'width' | 'pressure'> & { points: Point[] };

type Gesture =
  | { kind: 'ink'; pointerId: number; stroke: LiveStroke; ruler: boolean; snapped: boolean; /** czytamy nacisk z rysika */ real: boolean; t0: number }
  | {
      kind: 'erase';
      pointerId: number;
      mode: 'stroke' | 'partial';
      radius: number;
      last: [number, number];
      /** id oryginalnej kreski → co z niej zostało (pusta lista = usunięta w całości) */
      work: Map<string, StrokeObj[]>;
    }
  | { kind: 'lasso'; pointerId: number; poly: [number, number][] };

interface Props {
  page: Page;
  /** piksele CSS na milimetr */
  scale: number;
  settings: ToolSettings;
}

export const PageView = memo(function PageView({ page, scale, settings }: Props) {
  const objects = useLiveQuery(() => listObjects(page.id), [page.id]) ?? EMPTY;
  const pageRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  /** stuknięcie palcem z narzędziem lasso (w trybie przewijania) */
  const tap = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Podgląd zmian (gumka, przesuwanie lassem) zanim trafią do bazy.
  const [override, setOverride] = useState<Map<string, PageObject[]> | null>(null);
  const clearOverrideOnNextData = useRef(false);
  // Zaznaczenie lassem (id obiektów).
  const [sel, setSel] = useState<ID[] | null>(null);

  const cssW = PAGE_W * scale;
  const cssH = PAGE_H * scale;
  const dpr = canvasDpr(cssW, cssH);

  const shown = useMemo(() => {
    if (!override) return objects;
    const out: PageObject[] = [];
    for (const o of objects) {
      const repl = override.get(o.id);
      if (repl) out.push(...repl);
      else out.push(o);
    }
    return out;
  }, [objects, override]);

  const texts = useMemo(() => shown.filter((o): o is TextObj => o.type === 'text'), [shown]);
  const images = useMemo(() => shown.filter((o): o is ImageObj => o.type === 'image'), [shown]);
  const diagrams = useMemo(() => shown.filter((o): o is PlotObj | CircuitObj => o.type === 'plot' || o.type === 'circuit'), [shown]);

  // Gdy z bazy przyjdą nowe dane po zapisaniu zmian, chowamy podgląd (bez mignięcia starej wersji).
  useEffect(() => {
    if (clearOverrideOnNextData.current) {
      clearOverrideOnNextData.current = false;
      setOverride(null);
    }
  }, [objects]);

  // Zaznaczenie znika, gdy zmienimy narzędzie albo zaznaczone obiekty przestaną istnieć.
  useEffect(() => { if (settings.tool !== 'lasso') setSel(null); }, [settings.tool]);
  useEffect(() => {
    setSel((cur) => {
      if (!cur) return cur;
      const alive = cur.filter((id) => objects.some((o) => o.id === id));
      return alive.length ? (alive.length === cur.length ? cur : alive) : null;
    });
  }, [objects]);

  // Przerysowanie zapisanych kresek.
  useLayoutEffect(() => {
    const c = inkRef.current;
    if (!c) return;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawStrokes(ctx, shown);
  }, [shown, cssW, cssH, dpr, scale]);

  useLayoutEffect(() => {
    const c = liveRef.current;
    if (!c) return;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
  }, [cssW, cssH, dpr]);

  /** Wysokości bloków tekstu w mm – zależą od zawijania wierszy, więc mierzymy je w DOM. */
  const measureTextHeights = (): TextHeights => {
    const m: TextHeights = new Map();
    pageRef.current?.querySelectorAll<HTMLElement>('.text-block[data-id]').forEach((el) => {
      m.set(el.dataset.id!, el.offsetHeight / scale);
    });
    return m;
  };

  // ---------- rysowanie na żywo ----------

  const liveCtx = () => {
    const ctx = liveRef.current!.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    return ctx;
  };

  const raf = useRef(0);
  const predicted = useRef<Point[]>([]);
  const scheduleLive = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const g = gesture.current;
      if (!g || !liveRef.current) return;
      const ctx = liveCtx();
      if (g.kind === 'ink') {
        drawLiveStroke(ctx, g.stroke, g.snapped || g.ruler ? [] : predicted.current);
      } else if (g.kind === 'lasso') {
        ctx.beginPath();
        g.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([6 / scale, 5 / scale]);
        ctx.strokeStyle = '#3b5bdb';
        ctx.fillStyle = 'rgba(59,91,219,0.06)';
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(g.last[0], g.last[1], g.radius, 0, Math.PI * 2);
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = 'rgba(59,91,219,0.8)';
        ctx.fillStyle = 'rgba(59,91,219,0.08)';
        ctx.fill();
        ctx.stroke();
      }
    });
  };

  const toPage = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = liveRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };

  const holdTimer = useRef(0);
  const cancelGesture = () => {
    clearTimeout(holdTimer.current);
    gesture.current = null;
    predicted.current = [];
    setOverride(null);
    if (liveRef.current) liveCtx();
    if (touchState.cancelInk === cancelGesture) touchState.cancelInk = null;
  };

  // ---------- prostowanie kształtów (przytrzymanie na końcu kreski) ----------

  const armHold = () => {
    clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      const g = gesture.current;
      if (!g || g.kind !== 'ink' || g.snapped || g.ruler) return;
      const shape = recognizeShape(g.stroke.points);
      if (!shape) return;
      g.stroke.points = shape.points;
      g.stroke.pressure = true; // stały nacisk z kształtu = równa linia
      g.snapped = true;
      navigator.vibrate?.(10);
      scheduleLive();
    }, HOLD_MS);
  };

  // ---------- gumka ----------

  const eraseAt = (g: Extract<Gesture, { kind: 'erase' }>, x: number, y: number) => {
    // Interpolujemy między ostatnią a obecną pozycją, żeby szybki ruch niczego nie przeskoczył.
    const [lx, ly] = g.last;
    const steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / (g.radius / 2)));
    let changed = false;
    for (let i = 1; i <= steps; i++) {
      const cx = lx + ((x - lx) * i) / steps;
      const cy = ly + ((y - ly) * i) / steps;
      for (const o of objects) {
        if (o.type !== 'stroke') continue;
        const current = g.work.get(o.id);
        if (g.mode === 'stroke') {
          if (current) continue;
          if (strokeHit(o, cx, cy, g.radius)) { g.work.set(o.id, []); changed = true; }
          continue;
        }
        const parts = current ?? [o];
        let partsChanged = false;
        const next: StrokeObj[] = [];
        for (const part of parts) {
          const reach = g.radius + part.width / 2;
          const pieces = eraseFromStroke(part.points, cx, cy, reach);
          if (!pieces) { next.push(part); continue; }
          partsChanged = true;
          for (const pts of pieces) next.push({ ...part, id: newId(), points: pts.map((p) => roundPoint(p[0], p[1], p[2])) });
        }
        if (partsChanged) { g.work.set(o.id, next); changed = true; }
      }
    }
    g.last = [x, y];
    if (changed) setOverride(new Map(g.work));
  };

  const finishErase = async (g: Extract<Gesture, { kind: 'erase' }>) => {
    if (g.work.size === 0) { setOverride(null); return; }
    const before = objects.filter((o) => g.work.has(o.id));
    const after = [...g.work.values()].flat();
    clearOverrideOnNextData.current = true;
    if (g.mode === 'stroke' || after.length === 0) await history.remove(before);
    else await history.replace(before, after);
  };

  // ---------- obsługa wskaźnika (rysik / mysz / palec) ----------

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = settingsRef.current;
    if (e.pointerType === 'touch' && (!s.fingerDraw || touchState.count > 1)) {
      // palec przewija (Editor), ale stuknięcie z narzędziem lasso zaznacza obiekt pod palcem
      if (s.tool === 'lasso' && touchState.count <= 1) tap.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gesture.current) return; // druga ręka/dłoń w trakcie pisania – ignorujemy
    const native = e.nativeEvent;
    // Lenovo Digital Pen 2: końcówka gumki lub przycisk gumki → buttons & 32; przycisk boczny → buttons & 2 (lasso)
    const isPen = e.pointerType === 'pen';
    const penEraser = isPen && (e.button === 5 || (e.buttons & 32) !== 0);
    const penBarrel = isPen && !penEraser && (e.buttons & 2) !== 0;
    const tool = penEraser ? 'eraser' : penBarrel ? 'lasso' : s.tool;
    if (tool === 'text') return;

    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* wskaźnik już nieaktywny */ }
    const [x, y] = toPage(native);
    setSel(null);

    if (tool === 'eraser') {
      const g: Gesture = {
        kind: 'erase',
        pointerId: e.pointerId,
        mode: penEraser ? 'stroke' : s.eraserMode,
        radius: s.eraserSize,
        last: [x, y],
        work: new Map(),
      };
      gesture.current = g;
      eraseAt(g, x, y);
    } else if (tool === 'lasso') {
      gesture.current = { kind: 'lasso', pointerId: e.pointerId, poly: [[x, y]] };
    } else {
      // Nacisk rysika tylko gdy włączony w pasku; wyłączony = stała grubość (bez „symulowania” z prędkości).
      const real = isPen && s.pressure && !s.ruler;
      const constant = !s.pressure || s.ruler;
      gesture.current = {
        kind: 'ink',
        pointerId: e.pointerId,
        ruler: s.ruler,
        snapped: false,
        real,
        t0: performance.now(),
        stroke: {
          tool,
          color: tool === 'pen' ? s.penColor : s.hlColor,
          width: tool === 'pen' ? s.penWidth : s.hlWidth,
          pressure: real || constant,
          points: [roundPoint(x, y, real ? native.pressure || 0.5 : 0.5)],
        },
      };
      armHold();
    }
    if (e.pointerType === 'touch') touchState.cancelInk = cancelGesture;
    scheduleLive();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const native = e.nativeEvent;
    const events = native.getCoalescedEvents?.() ?? [native];
    if (g.kind === 'ink') {
      if (g.snapped) return; // kształt już wyprostowany – ruch po przytrzymaniu ignorujemy
      const pts = g.stroke.points;
      if (g.ruler) {
        const [x, y] = toPage(native);
        g.stroke.points = straightLine([pts[0][0], pts[0][1]], [x, y]);
        scheduleLive();
        return;
      }
      let moved = false;
      for (const ev of events.length ? events : [native]) {
        const [x, y] = toPage(ev);
        const last = pts[pts.length - 1];
        const d = Math.hypot(x - last[0], y - last[1]);
        if (d < 0.12) continue; // pomijamy „drgania” < 0,12 mm
        if (d > 0.6) moved = true;
        pts.push(roundPoint(x, y, g.real ? ev.pressure || 0.5 : 0.5));
      }
      if (moved) armHold();
      predicted.current = (native.getPredictedEvents?.() ?? []).slice(0, 2).map((ev) => {
        const [x, y] = toPage(ev);
        return [x, y, g.real ? ev.pressure || 0.5 : 0.5] as Point;
      });
    } else if (g.kind === 'lasso') {
      for (const ev of events.length ? events : [native]) {
        const p = toPage(ev);
        const last = g.poly[g.poly.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.8) g.poly.push(p);
      }
    } else {
      const [x, y] = toPage(native);
      eraseAt(g, x, y);
    }
    scheduleLive();
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = tap.current;
    if (t && t.pointerId === e.pointerId) {
      tap.current = null;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10) selectAt(...toPage(e));
      return;
    }
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    clearTimeout(holdTimer.current);
    gesture.current = null;
    predicted.current = [];
    if (touchState.cancelInk === cancelGesture) touchState.cancelInk = null;
    liveCtx();
    if (g.kind === 'erase') {
      await finishErase(g);
      return;
    }
    if (g.kind === 'lasso') {
      // krótkie stuknięcie zamiast obrysu → zaznacz obiekt pod kursorem/rysikiem
      const b = bboxOf(g.poly.map(([x, y]) => [x, y, 0] as Point));
      if (Math.max(b.maxX - b.minX, b.maxY - b.minY) < 3) { selectAt(g.poly[0][0], g.poly[0][1]); return; }
      const ids = selectInPolygon(objects, g.poly, measureTextHeights());
      setSel(ids.length ? ids : null);
      return;
    }
    // Krótkie stuknięcie piórem w zdjęcie / wykres / schemat → zaznacz je (zamiast stawiać kropkę).
    const tb = bboxOf(g.stroke.points);
    if (!g.snapped && performance.now() - g.t0 < 350 && Math.max(tb.maxX - tb.minX, tb.maxY - tb.minY) < 1.2) {
      const [px, py] = g.stroke.points[0];
      const box = [...objects].reverse().find((o) => o.type !== 'stroke' && o.type !== 'text' && px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h);
      if (box) { setSel([box.id]); return; }
    }
    const obj: StrokeObj = {
      id: newId(),
      pageId: page.id,
      type: 'stroke',
      z: nextZ(),
      ...g.stroke,
      updatedAt: 0,
      deleted: 0,
      dirty: 1,
    };
    // Rysujemy od razu na warstwie zapisanej – zapis do bazy trwa kilka ms i nie chcemy mignięcia.
    const ink = inkRef.current?.getContext('2d');
    if (ink) drawLiveStroke(ink, obj);
    await history.add([obj]);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tap.current?.pointerId === e.pointerId) tap.current = null; // palec zaczął przewijać – to nie było stuknięcie
    if (gesture.current?.pointerId === e.pointerId) cancelGesture();
  };

  /** Zaznacza najwyższy obiekt w punkcie (x, y) mm: zdjęcie, wykres, schemat, blok tekstu albo kreskę. */
  const selectAt = (x: number, y: number) => {
    const heights = measureTextHeights();
    const hit = [...objects].reverse().find((o) => {
      if (o.type === 'stroke') return strokeHit(o, x, y, 1.5);
      if (o.type === 'text') return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + (heights.get(o.id) ?? 5);
      return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
    });
    setSel(hit ? [hit.id] : null);
  };

  // ---------- zaznaczenie lassem ----------

  const selected = useMemo(() => (sel ? objects.filter((o) => sel.includes(o.id)) : []), [objects, sel]);
  const selShown = useMemo(() => (sel ? shown.filter((o) => sel.includes(o.id)) : []), [shown, sel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bbox = useMemo(() => objectsBBox(selShown, measureTextHeights()), [selShown, scale]);

  const commitTransform = async (after: PageObject[]) => {
    clearOverrideOnNextData.current = true;
    await history.replace(selected, after);
  };

  const actions = {
    remove: () => { history.remove(selected); setSel(null); },
    copy: () => clipboard.set(selected),
    cut: () => { clipboard.set(selected); history.remove(selected); setSel(null); },
    duplicate: async () => {
      const copies = selected.map((o) => ({ ...transformObject(o, 5, 5), id: newId(), z: nextZ() }));
      await history.add(copies);
      setSel(copies.map((c) => c.id));
    },
    recolor: (color: string) => {
      const after = selected.map((o) => (o.type === 'stroke' && o.tool === 'pen' ? { ...o, color } : o));
      history.replace(selected, after);
    },
  };

  // Skróty klawiszowe dla zaznaczenia.
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.remove(); }
      else if (e.key === 'Escape') setSel(null);
      else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); actions.copy(); }
      else if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); actions.cut(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); actions.duplicate(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Przesuwanie (środek) i skalowanie (narożniki) zaznaczenia. */
  const startTransform = (e: React.PointerEvent, corner: null | [0 | 1, 0 | 1]) => {
    if (!bbox) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignorujemy */ }
    const [sx, sy] = toPage(e);
    // punkt stały przy skalowaniu = przeciwległy narożnik
    const ax = corner ? (corner[0] ? bbox.minX : bbox.maxX) : 0;
    const ay = corner ? (corner[1] ? bbox.minY : bbox.maxY) : 0;
    const d0 = corner ? Math.hypot(sx - ax, sy - ay) : 1;
    let after: PageObject[] = selected;
    const move = (ev: PointerEvent) => {
      const [x, y] = toPage(ev);
      after = corner
        ? selected.map((o) => transformObject(o, 0, 0, Math.max(0.1, Math.hypot(x - ax, y - ay) / d0), ax, ay))
        : selected.map((o) => transformObject(o, x - sx, y - sy));
      setOverride(new Map(after.map((o) => [o.id, [o]])));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (after !== selected) commitTransform(after);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const hasPenStrokes = selected.some((o) => o.type === 'stroke' && o.tool === 'pen');

  return (
    <div
      ref={pageRef}
      className="page"
      data-tool={settings.tool}
      style={{ width: cssW, height: cssH, ['--mm' as string]: scale + 'px' }}
    >
      <div className="page-bg" style={backgroundStyle(page.background, scale)} />
      {page.pdf && <PdfBackground pdf={page.pdf} />}
      <ImageLayer images={images} scale={scale} />
      <DiagramLayer items={diagrams} scale={scale} />
      <TextLayer pageId={page.id} texts={texts} scale={scale} active={settings.tool === 'text'} />
      <canvas ref={inkRef} className="ink" />
      <canvas
        ref={liveRef}
        className="live"
        style={{ pointerEvents: settings.tool === 'text' ? 'none' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <PlaceOverlay pageId={page.id} scale={scale} />
      {bbox && sel && (
        <>
          <div
            className="selection"
            style={{
              left: (bbox.minX - 1.5) * scale,
              top: (bbox.minY - 1.5) * scale,
              width: (bbox.maxX - bbox.minX + 3) * scale,
              height: (bbox.maxY - bbox.minY + 3) * scale,
            }}
            onPointerDown={(e) => startTransform(e, null)}
          >
            {([[0, 0], [1, 0], [0, 1], [1, 1]] as [0 | 1, 0 | 1][]).map(([cx, cy]) => (
              <span
                key={`${cx}${cy}`}
                className="handle"
                style={{ left: cx ? '100%' : 0, top: cy ? '100%' : 0, cursor: cx === cy ? 'nwse-resize' : 'nesw-resize' }}
                onPointerDown={(e) => startTransform(e, [cx, cy])}
              />
            ))}
          </div>
          <div
            className="sel-menu"
            style={{ left: (bbox.minX - 1.5) * scale, top: bbox.minY * scale > 56 ? (bbox.minY - 1.5) * scale - 48 : (bbox.maxY + 1.5) * scale + 8 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {selected.length === 1 && (selected[0].type === 'plot' || selected[0].type === 'circuit') && (
              <button onClick={() => diagramEditing.open(selected[0] as PlotObj | CircuitObj)}><b>Edytuj</b></button>
            )}
            {selected.length === 1 && selected[0].type === 'image' && (
              <button onClick={() => imageEditing.open(selected[0] as ImageObj)}><b>Edytuj</b></button>
            )}
            <button onClick={actions.copy}>Kopiuj</button>
            <button onClick={actions.cut}>Wytnij</button>
            <button onClick={actions.duplicate}>Duplikuj</button>
            {hasPenStrokes && PEN_COLORS.slice(0, 4).map((c) => (
              <button key={c} className="sel-swatch" style={{ background: c }} aria-label={`Zmień kolor na ${c}`} onClick={() => actions.recolor(c)} />
            ))}
            <button className="danger" onClick={actions.remove}>Usuń</button>
          </div>
        </>
      )}
    </div>
  );
});
