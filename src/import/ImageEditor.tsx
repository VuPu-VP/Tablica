import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { db } from '../db/db';
import type { ImageObj } from '../db/types';
import { history } from '../ink/history';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/toast';
import { FILTER_LABELS, type ImageFilter } from './filters';
import { FULL, renderEdit, saveEdit, type Crop, type ImageEdit } from './imageEdit';

// Który obraz jest edytowany (okno wyświetla Editor) – zdjęcie na kartce albo w skrzynce.
let current: ImageObj | null = null;
const listeners = new Set<() => void>();
export const imageEditing = {
  get: () => current,
  open(obj: ImageObj) { current = obj; listeners.forEach((f) => f()); },
  close() { current = null; listeners.forEach((f) => f()); },
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
};

const MIN = 0.05; // najmniejszy kadr: 5% boku

function ImageEditor({ obj, onClose }: { obj: ImageObj; onClose: () => void }) {
  const [edit, setEdit] = useState<ImageEdit>({ rotation: 0, crop: FULL, filter: 'none' });
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Podgląd: obrót + filtr na całym obrazie (kadr pokazujemy ramką na wierzchu).
  useEffect(() => {
    let alive = true;
    (async () => {
      const src = await db.blobs.get(obj.blobId);
      if (!src) { setPreview(null); return; }
      const c = await renderEdit(src.data, { ...edit, crop: FULL }, 900);
      if (alive) setPreview(c.toDataURL('image/jpeg', 0.85));
    })();
    return () => { alive = false; };
  }, [obj.blobId, edit.rotation, edit.filter]);

  const rotate = (dir: 1 | -1) =>
    setEdit((e) => ({ ...e, rotation: (((e.rotation + dir * 90) % 360) + 360) % 360 as ImageEdit['rotation'], crop: FULL }));

  /** Przeciąganie ramki kadru (środek = przesuwanie, narożniki = zmiana rozmiaru). */
  const drag = (e: React.PointerEvent, mode: 'move' | 0 | 1 | 2 | 3) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignorujemy */ }
    const r = box.current!.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, crop: edit.crop };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / r.width;
      const dy = (ev.clientY - start.y) / r.height;
      const c = start.crop;
      let n: Crop;
      if (mode === 'move') {
        n = { ...c, x: Math.min(1 - c.w, Math.max(0, c.x + dx)), y: Math.min(1 - c.h, Math.max(0, c.y + dy)) };
      } else {
        // narożniki: 0 lewy-górny, 1 prawy-górny, 2 prawy-dolny, 3 lewy-dolny
        let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
        if (mode === 0 || mode === 3) x1 = Math.min(x2 - MIN, Math.max(0, x1 + dx));
        if (mode === 1 || mode === 2) x2 = Math.max(x1 + MIN, Math.min(1, x2 + dx));
        if (mode === 0 || mode === 1) y1 = Math.min(y2 - MIN, Math.max(0, y1 + dy));
        if (mode === 2 || mode === 3) y2 = Math.max(y1 + MIN, Math.min(1, y2 + dy));
        n = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
      setEdit((ed) => ({ ...ed, crop: n }));
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const unchanged = edit.rotation === 0 && edit.filter === 'none' && edit.crop === FULL;

  const save = async () => {
    setBusy(true);
    try {
      const { blobId, aspect } = await saveEdit(obj.blobId, edit);
      // szerokość na kartce zostaje, wysokość wynika z nowych proporcji
      const after: ImageObj = { ...obj, blobId, orig: obj.orig ?? obj.blobId, h: Math.round(obj.w * aspect * 10) / 10 };
      await history.replace([obj], [after]);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!obj.orig) return;
    const src = await db.blobs.get(obj.orig);
    if (!src) { toast('Oryginał jeszcze się nie pobrał', 'error'); return; }
    const bmp = await createImageBitmap(src.data);
    const after: ImageObj = { ...obj, blobId: obj.orig, orig: undefined, h: Math.round((obj.w * bmp.height) / bmp.width * 10) / 10 };
    bmp.close();
    await history.replace([obj], [after]);
    onClose();
  };

  const c = edit.crop;
  const pct = (v: number) => `${v * 100}%`;

  return (
    <Dialog title="Edycja zdjęcia" onClose={onClose} wide>
      <div className="image-editor">
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn ghost sm" onClick={() => rotate(-1)} title="Obróć w lewo"><Icon name="rotateCcw" size={16} /> Obróć</button>
          <button className="btn ghost sm" onClick={() => rotate(1)} title="Obróć w prawo"><Icon name="rotateCw" size={16} /> Obróć</button>
          <button className="btn ghost sm" onClick={() => setEdit((e) => ({ ...e, crop: FULL }))} disabled={c === FULL} title="Cały obraz"><Icon name="crop" size={16} /> Pełny kadr</button>
          <div className="seg" role="radiogroup" aria-label="Filtr">
            {(Object.keys(FILTER_LABELS) as ImageFilter[]).map((f) => (
              <button key={f} className={edit.filter === f ? 'on' : ''} onClick={() => setEdit((e) => ({ ...e, filter: f }))}>{FILTER_LABELS[f]}</button>
            ))}
          </div>
        </div>
        <p className="muted small">Przeciągnij narożniki ramki, aby przyciąć. „Skan” – białe tło kartki lub tablicy, „Kreda” – zielona/czarna tablica na białym tle.</p>
        <div className="crop-stage">
          {preview ? (
            <div className="crop-box" ref={box}>
              <img src={preview} alt="" draggable={false} />
              <div className="crop-shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(c.x)} ${pct(c.y)}, ${pct(c.x)} ${pct(c.y + c.h)}, ${pct(c.x + c.w)} ${pct(c.y + c.h)}, ${pct(c.x + c.w)} ${pct(c.y)}, ${pct(c.x)} ${pct(c.y)})` }} />
              <div className="crop-rect" style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }} onPointerDown={(e) => drag(e, 'move')}>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`crop-handle h${i}`} onPointerDown={(e) => drag(e, i as 0 | 1 | 2 | 3)} />
                ))}
              </div>
            </div>
          ) : <p className="muted">Wczytywanie zdjęcia…</p>}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {obj.orig && <button className="btn ghost" onClick={restore}>Przywróć oryginał</button>}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Anuluj</button>
          <button className="btn" disabled={busy || unchanged || !preview} onClick={save}>{busy ? 'Zapisywanie…' : 'Zapisz'}</button>
        </div>
      </div>
    </Dialog>
  );
}

/** Okno edycji zdjęcia (jedno na całą aplikację). */
export function ImageEditorHost() {
  const obj = useSyncExternalStore(imageEditing.subscribe, imageEditing.get);
  return obj ? <ImageEditor key={obj.id} obj={obj} onClose={() => imageEditing.close()} /> : null;
}
