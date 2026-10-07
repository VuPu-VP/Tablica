import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPage, listPages, newId, nextZ } from '../db/repo';
import { PAGE_H, PAGE_W, type ID, type Page } from '../db/types';
import { DiagramEditorHost } from '../diagrams/DiagramLayer';
import { diagramEditing, newCircuit, newPlot } from '../diagrams/editing';
import { insertImage, pickFiles } from '../import/image';
import { importPdf } from '../import/pdf';
import { clipboard } from '../ink/clipboard';
import { history } from '../ink/history';
import { transformObject } from '../ink/selection';
import { PageView } from '../pages/PageView';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/toast';
import { touchState } from './gestures';
import { Toolbar } from './Toolbar';
import { useToolSettings, type Tool } from './tools';

interface Props {
  notebookId: ID;
  /** Prośba o przewinięcie do strony (nonce, żeby dało się kliknąć tę samą stronę ponownie). */
  jump: { pageId: ID; nonce: number } | null;
  onCurrentPage: (page: Page | undefined, index: number, total: number) => void;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
const PAD_X = 24;

export function Editor({ notebookId, jump, onCurrentPage }: Props) {
  const pages = useLiveQuery(() => listPages(notebookId), [notebookId]);
  const [settings, update] = useToolSettings();
  const placing = useSyncExternalStore(diagramEditing.subscribe, diagramEditing.getPlacing);
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') diagramEditing.stopPlacing(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);
  const scroller = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(3);
  const [zoom, setZoom] = useState(1);
  const scale = fit * zoom;
  const [visible, setVisible] = useState<Set<ID>>(new Set());
  const [currentId, setCurrentId] = useState<ID | null>(null);

  // „Dopasuj do szerokości”: ile pikseli na milimetr, żeby kartka zmieściła się w oknie.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      if (!el.clientWidth) return;
      const pad = window.innerWidth < 768 ? 16 : PAD_X * 2;
      setFit(Math.max(1, Math.min(3.6, (el.clientWidth - pad) / PAGE_W)));
    };
    measure(); // od razu – ResizeObserver zgłasza rozmiar dopiero przy najbliższej klatce
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Które strony są blisko ekranu (renderujemy tylko je) i która jest „bieżąca”.
  const ratios = useRef(new Map<string, number>());
  useEffect(() => {
    const el = scroller.current;
    if (!el || !pages) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const en of entries) {
            const id = (en.target as HTMLElement).dataset.pageId!;
            if (en.isIntersecting) next.add(id); else next.delete(id);
          }
          return next;
        });
      },
      { root: el, rootMargin: '100% 0px' },
    );
    const io2 = new IntersectionObserver(
      (entries) => {
        for (const en of entries) ratios.current.set((en.target as HTMLElement).dataset.pageId!, en.intersectionRatio);
        let best: string | null = null, bestR = 0;
        for (const [id, r] of ratios.current) if (r > bestR) { best = id; bestR = r; }
        if (best) setCurrentId(best);
      },
      { root: el, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    el.querySelectorAll<HTMLElement>('[data-page-id]').forEach((n) => { io.observe(n); io2.observe(n); });
    return () => { io.disconnect(); io2.disconnect(); ratios.current.clear(); };
  }, [pages, scale]);

  const currentIndex = pages?.findIndex((p) => p.id === currentId) ?? -1;
  useEffect(() => {
    if (!pages) return;
    const idx = currentIndex >= 0 ? currentIndex : 0;
    onCurrentPage(pages[idx], idx, pages.length);
  }, [pages, currentIndex, onCurrentPage]);

  // Przewinięcie do strony klikniętej w miniaturach.
  // (czekamy też na wczytanie stron – po otwarciu zeszytu z wyszukiwarki strony jeszcze się ładują)
  const handledJump = useRef<number | null>(null);
  useEffect(() => {
    if (!jump || !pages || handledJump.current === jump.nonce) return;
    const n = scroller.current?.querySelector<HTMLElement>(`[data-page-id="${jump.pageId}"]`);
    if (!n) return;
    handledJump.current = jump.nonce;
    n.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [jump, pages]);

  // ---------- Zoom z zachowaniem punktu pod kursorem/palcami ----------
  const anchor = useRef<{ cx: number; cy: number; vx: number; vy: number; ratio: number } | null>(null);
  const zoomAt = (next: number, clientX: number, clientY: number) => {
    const el = scroller.current!;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    if (z === zoom) return;
    const r = el.getBoundingClientRect();
    const vx = clientX - r.left, vy = clientY - r.top;
    anchor.current = { cx: el.scrollLeft + vx, cy: el.scrollTop + vy, vx, vy, ratio: z / zoom };
    setZoom(z);
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = scroller.current;
    if (!a || !el) return;
    anchor.current = null;
    el.scrollLeft = a.cx * a.ratio - a.vx;
    el.scrollTop = a.cy * a.ratio - a.vy;
  }, [zoom]);

  // Ctrl + kółko (i gest szczypania na touchpadzie, który przeglądarka zamienia na Ctrl+kółko).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---------- Dotyk: przewijanie jednym palcem, szczypanie dwoma (faza capture = przed stroną) ----------
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number; mx: number; my: number } | null>(null);
  const velocity = useRef({ vx: 0, vy: 0, t: 0 });
  const inertia = useRef(0);

  const onTouchDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    cancelAnimationFrame(inertia.current);
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touchState.count = touches.current.size;
    if (touches.current.size >= 2) {
      touchState.cancelInk?.(); // drugi palec → to nie było rysowanie, tylko gest
      const [a, b] = [...touches.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      e.stopPropagation();
    } else if (!settings.fingerDraw && !diagramEditing.getPlacing()) {
      e.stopPropagation(); // przy wstawianiu wykresu stuknięcie palcem ma trafić w kartkę
    }
    velocity.current = { vx: 0, vy: 0, t: performance.now() };
  };

  const onTouchMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const prev = touches.current.get(e.pointerId);
    if (!prev) return;
    const el = scroller.current!;
    const cur = { x: e.clientX, y: e.clientY };
    touches.current.set(e.pointerId, cur);
    if (touches.current.size >= 2 && pinch.current) {
      const [a, b] = [...touches.current.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      el.scrollLeft -= mx - pinch.current.mx;
      el.scrollTop -= my - pinch.current.my;
      pinch.current.mx = mx; pinch.current.my = my;
      zoomAt(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), mx, my);
      e.stopPropagation();
    } else if (!settings.fingerDraw) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      el.scrollLeft -= dx;
      el.scrollTop -= dy;
      const now = performance.now();
      const dt = Math.max(1, now - velocity.current.t);
      velocity.current = { vx: 0.8 * (dx / dt) + 0.2 * velocity.current.vx, vy: 0.8 * (dy / dt) + 0.2 * velocity.current.vy, t: now };
      e.stopPropagation();
    }
  };

  const onTouchUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !touches.current.has(e.pointerId)) return;
    touches.current.delete(e.pointerId);
    touchState.count = touches.current.size;
    if (touches.current.size < 2) pinch.current = null;
    if (touches.current.size === 0 && !settings.fingerDraw) {
      // bezwładność: przewijanie wyhamowuje płynnie jak natywne
      let { vx, vy } = velocity.current;
      if (performance.now() - velocity.current.t > 80) return;
      const el = scroller.current!;
      const step = () => {
        vx *= 0.95; vy *= 0.95;
        if (Math.abs(vx) < 0.02 && Math.abs(vy) < 0.02) return;
        el.scrollLeft -= vx * 16; el.scrollTop -= vy * 16;
        inertia.current = requestAnimationFrame(step);
      };
      inertia.current = requestAnimationFrame(step);
    }
  };

  // ---------- Wklejanie ze schowka na bieżącą stronę ----------
  const paste = async () => {
    const items = clipboard.get();
    const target = currentId ?? pages?.[0]?.id;
    if (!items.length || !target) return;
    // na tę samą stronę wklejamy z przesunięciem 5 mm, żeby kopia nie zasłoniła oryginału
    const shift = items.some((o) => o.pageId === target) ? 5 : 0;
    const copies = items.map((o) => ({ ...transformObject(o, shift, shift), id: newId(), pageId: target, z: nextZ() }));
    await history.add(copies);
    clipboard.set(copies);
  };
  const pasteRef = useRef(paste);
  pasteRef.current = paste;

  // ---------- Zdjęcia i PDF ----------
  /** Wysokość (mm) górnej krawędzi widocznej części strony – tam wstawiamy zdjęcie. */
  const visibleY = (pageId: ID) => {
    const el = scroller.current?.querySelector(`[data-page-id="${pageId}"]`);
    if (!el) return 20;
    const r = el.getBoundingClientRect();
    const sr = scroller.current!.getBoundingClientRect();
    return Math.max(10, Math.min(PAGE_H - 60, (sr.top + 90 - r.top) / scale));
  };
  const addImages = async (files: File[]) => {
    const target = currentId ?? pages?.[0]?.id;
    if (!target || !files.length) return;
    let y = visibleY(target);
    for (const f of files) {
      const o = await insertImage(f, target, y);
      if (o) y = Math.min(PAGE_H - 20, o.y + o.h + 5);
    }
  };
  const addPdf = async (file: File) => {
    toast(`Importuję „${file.name}”…`);
    try {
      const first = await importPdf(file, notebookId, currentId);
      if (first) requestAnimationFrame(() => scroller.current?.querySelector(`[data-page-id="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      toast('Nie udało się zaimportować PDF: ' + (e as Error).message, 'error');
    }
  };
  const addFiles = (files: File[]) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf');
    pdfs.forEach(addPdf);
    addImages(files.filter((f) => f.type.startsWith('image/')));
  };
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;

  // Wklejanie: zdjęcie ze schowka systemowego (np. zrzut ekranu) albo zaznaczenie skopiowane w aplikacji.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); addFilesRef.current(files); return; }
      if (clipboard.get().length) { e.preventDefault(); pasteRef.current(); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // ---------- Skróty klawiszowe ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) history.redo(); else history.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); return; }
      if (mod || e.altKey) return;
      const map: Record<string, Tool> = { p: 'pen', h: 'highlighter', e: 'eraser', t: 'text', l: 'lasso' };
      const tool = map[e.key.toLowerCase()];
      if (tool) update({ tool });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [update]);

  const addPageAtEnd = async () => {
    const p = await createPage(notebookId, 'end');
    requestAnimationFrame(() =>
      scroller.current?.querySelector(`[data-page-id="${p.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  return (
    <div className="editor">
      <Toolbar
        settings={settings}
        update={update}
        onPaste={paste}
        onImage={async (capture) => addImages(await pickFiles('image/*', { capture, multiple: !capture }))}
        onPdf={async () => { const [f] = await pickFiles('application/pdf'); if (f) addPdf(f); }}
        onDiagram={(kind) => {
          const target = currentId ?? pages?.[0]?.id;
          if (target) diagramEditing.open(kind === 'plot' ? newPlot(target, visibleY(target)) : newCircuit(target, visibleY(target)), true);
        }}
      />
      <div
        className="scroller"
        ref={scroller}
        onPointerDownCapture={onTouchDown}
        onPointerMoveCapture={onTouchMove}
        onPointerUpCapture={onTouchUp}
        onPointerCancelCapture={onTouchUp}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); }}
      >
        {(pages ?? []).map((p) =>
          visible.has(p.id) ? (
            <div key={p.id} data-page-id={p.id}>
              <PageView page={p} scale={scale} settings={settings} />
            </div>
          ) : (
            <div key={p.id} data-page-id={p.id} className="page" style={{ width: PAGE_W * scale, height: PAGE_H * scale }} />
          ),
        )}
        <button className="btn ghost" onClick={addPageAtEnd}>
          <Icon name="plus" size={18} /> Nowa strona
        </button>
      </div>
      <DiagramEditorHost />
      {placing && (
        <div className="place-banner" role="status">
          <span>Kliknij na kartce, gdzie wstawić {placing.type === 'plot' ? 'układ współrzędnych' : 'schemat'}</span>
          <button className="btn ghost sm" onClick={() => diagramEditing.open(placing, true)}>Wróć do edycji</button>
          <button className="btn ghost sm" onClick={() => diagramEditing.stopPlacing()}>Anuluj (Esc)</button>
        </div>
      )}
      <div className="zoom" aria-label="Powiększenie">
        <button onClick={() => { const r = scroller.current!.getBoundingClientRect(); zoomAt(zoom / 1.25, r.left + r.width / 2, r.top + r.height / 2); }} aria-label="Pomniejsz">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => { const r = scroller.current!.getBoundingClientRect(); zoomAt(zoom * 1.25, r.left + r.width / 2, r.top + r.height / 2); }} aria-label="Powiększ">+</button>
        <button onClick={() => setZoom(1)}>Dopasuj</button>
      </div>
    </div>
  );
}
