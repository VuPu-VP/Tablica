import { memo, useRef, useState, useSyncExternalStore } from 'react';
import type { CircuitObj, ID, PlotObj } from '../db/types';
import { history } from '../ink/history';
import { CircuitEditor } from './CircuitEditor';
import { CircuitSvg } from './CircuitSvg';
import { diagramEditing, placeAt, type DiagramObj } from './editing';
import { placeFromInbox } from '../import/inbox';
import { useBlobUrl } from '../import/blobs';
import { PlotEditor } from './PlotEditor';
import { PlotSvg } from './PlotSvg';

/** Wykresy i schematy na kartce – pod pismem, więc rysikiem można po nich pisać. */
export const DiagramLayer = memo(function DiagramLayer({ items, scale }: { items: (PlotObj | CircuitObj)[]; scale: number }) {
  return (
    <div className="image-layer">
      {items.map((o) => {
        const style = { position: 'absolute' as const, left: o.x * scale, top: o.y * scale, width: o.w * scale, height: o.h * scale };
        return o.type === 'plot' ? <PlotSvg key={o.id} p={o} style={style} /> : <CircuitSvg key={o.id} c={o} style={style} />;
      })}
    </div>
  );
});

/**
 * Tryb wstawiania: półprzezroczysty podgląd idzie za kursorem/rysikiem,
 * klik (albo stuknięcie palcem) wstawia obiekt w to miejsce – na tej kartce, którą wskażesz.
 */
export function PlaceOverlay({ pageId, scale }: { pageId: ID; scale: number }) {
  const placing = useSyncExternalStore(diagramEditing.subscribe, diagramEditing.getPlacing);
  const imgUrl = useBlobUrl(placing?.type === 'image' ? placing.blobId : undefined);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  if (!placing) return null;

  const toMm = (e: React.PointerEvent): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };
  const place = (e: React.PointerEvent) => {
    const { x, y } = placeAt(placing, ...toMm(e));
    const fromInbox = diagramEditing.isFromInbox();
    diagramEditing.stopPlacing();
    if (fromInbox && placing.type === 'image') placeFromInbox(placing, pageId, x, y).then((p) => history.added([p]));
    else history.add([{ ...placing, pageId, x, y }]);
  };
  const ghost = { ...placing, x: 0, y: 0 };
  const style = pos && { position: 'absolute' as const, left: pos.x * scale, top: pos.y * scale, width: placing.w * scale, height: placing.h * scale };

  return (
    <div
      className="place-overlay"
      onPointerMove={(e) => setPos(placeAt(placing, ...toMm(e)))}
      onPointerLeave={() => setPos(null)}
      onPointerDown={(e) => {
        e.stopPropagation();
        down.current = { x: e.clientX, y: e.clientY };
        if (e.pointerType !== 'touch') place(e);
      }}
      onPointerUp={(e) => {
        // palcem: wstawiamy dopiero po puszczeniu, i tylko jeśli to było stuknięcie, a nie przewijanie
        const d = down.current;
        down.current = null;
        if (e.pointerType === 'touch' && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) place(e);
      }}
    >
      {style && (ghost.type === 'plot'
        ? <PlotSvg p={ghost} className="place-ghost" style={style} />
        : ghost.type === 'circuit'
          ? <CircuitSvg c={ghost} className="place-ghost" style={style} />
          : imgUrl && <img src={imgUrl} alt="" className="place-ghost" style={style} draggable={false} />)}
    </div>
  );
}

/** Okno edycji aktualnie otwartego wykresu/schematu (jedno na całą aplikację). */
export function DiagramEditorHost() {
  const ed = useSyncExternalStore(diagramEditing.subscribe, diagramEditing.get);
  if (!ed) return null;
  const close = () => diagramEditing.close();
  const save = async (obj: DiagramObj) => {
    // nowy obiekt: najpierw wskazujesz miejsce na kartce (podgląd idzie za kursorem)
    if (ed.isNew) diagramEditing.startPlacing(obj);
    else { close(); await history.replace([ed.obj], [obj]); }
  };
  return ed.obj.type === 'plot'
    ? <PlotEditor key={ed.obj.id} initial={ed.obj} isNew={ed.isNew} onSave={save} onClose={close} />
    : <CircuitEditor key={ed.obj.id} initial={ed.obj} isNew={ed.isNew} onSave={save} onClose={close} />;
}
