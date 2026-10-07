import { generateHTML, type JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db/db';
import { deleteObjects, newId, nextZ, patchObject, putObjects } from '../db/repo';
import { PAGE_W, type ID, type TextObj } from '../db/types';
import { history } from '../ink/history';
import { activeEditor } from './active';
import { baseExtensions, editorExtensions, emptyDoc, isDocEmpty } from './extensions';
import { hydrateMath } from './math';

const LINE = 5; // mm – wysokość wiersza = jedna kratka

/** Blok, który nie jest edytowany: zwykły HTML (szybko, nawet przy setkach bloków). */
export const StaticText = memo(function StaticText({ doc }: { doc: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => {
    try { return generateHTML(doc as JSONContent, baseExtensions); } catch { return ''; }
  }, [doc]);
  useLayoutEffect(() => { if (ref.current) hydrateMath(ref.current); }, [html]);
  return <div ref={ref} className="tiptap" dangerouslySetInnerHTML={{ __html: html }} />;
});

/** Aktywny edytor TipTap dla jednego bloku. Zapisuje w trakcie pisania i przy zamknięciu. */
function LiveText({ obj, click, isNew, onDone }: { obj: TextObj; click: { x: number; y: number } | null; isNew: boolean; onDone: () => void }) {
  const timer = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const editor = useEditor({
    extensions: editorExtensions,
    content: obj.doc as JSONContent,
    onUpdate: ({ editor }) => {
      activeEditor.bump();
      clearTimeout(timer.current);
      const doc = editor.getJSON();
      timer.current = window.setTimeout(() => patchObject(obj.id, { doc } as Partial<TextObj>), 400);
    },
    onSelectionUpdate: () => activeEditor.bump(),
    onBlur: ({ event }) => {
      const to = event.relatedTarget as HTMLElement | null;
      // przejście do pola wzoru albo kliknięcie w pasek narzędzi nie kończy edycji
      if (to?.closest('.toolbar, .math, .text-block.editing')) return;
      onDoneRef.current();
    },
  });

  const finalize = useRef(0);
  useEffect(() => {
    if (!editor) return;
    // React w trybie deweloperskim montuje komponent dwa razy – anulujemy „zamknięcie” z pierwszego razu.
    clearTimeout(finalize.current);
    activeEditor.set(editor);
    const pos = click ? editor.view.posAtCoords({ left: click.x, top: click.y })?.pos : undefined;
    editor.commands.focus(pos ?? 'end');
    return () => {
      // Zamknięcie edycji: ostateczny zapis, pusty blok znika.
      clearTimeout(timer.current);
      if (activeEditor.get() === editor) activeEditor.set(null);
      const doc = editor.getJSON();
      finalize.current = window.setTimeout(() => {
        if (isDocEmpty(doc)) {
          deleteObjects([obj.id]);
          return;
        }
        patchObject(obj.id, { doc } as Partial<TextObj>).then(async () => {
          if (isNew) {
            const saved = await db.objects.get(obj.id);
            if (saved) history.added([saved]);
          }
        });
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return <EditorContent editor={editor} />;
}

interface BlockProps {
  obj: TextObj;
  scale: number;
  active: boolean;
  editing: boolean;
  isNew: boolean;
  onStartEdit: (click: { x: number; y: number }) => void;
  onDone: () => void;
  click: { x: number; y: number } | null;
}

const TextBlock = memo(function TextBlock({ obj, scale, active, editing, isNew, onStartEdit, onDone, click }: BlockProps) {
  const [drag, setDrag] = useState<{ x: number; y: number; w: number } | null>(null);
  const x = drag?.x ?? obj.x;
  const y = drag?.y ?? obj.y;
  const w = drag?.w ?? obj.w;

  // Przesuwanie (uchwyt ⠿) i zmiana szerokości (prawa krawędź).
  const startDrag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignorujemy */ }
    const sx = e.clientX, sy = e.clientY;
    let last = { x: obj.x, y: obj.y, w: obj.w };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      last = mode === 'move'
        ? { x: Math.max(0, Math.min(PAGE_W - 10, obj.x + dx)), y: Math.max(0, obj.y + dy), w: obj.w }
        : { x: obj.x, y: obj.y, w: Math.max(20, Math.min(PAGE_W - obj.x, obj.w + dx)) };
      setDrag(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      const after: TextObj = { ...obj, x: Math.round(last.x * 2) / 2, y: Math.round(last.y / (LINE / 2)) * (LINE / 2), w: Math.round(last.w) };
      if (after.x !== obj.x || after.y !== obj.y || after.w !== obj.w) {
        history.replace([obj], [after]).then(() => setDrag(null));
      } else setDrag(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div
      className={`text-block ${active ? 'active' : ''} ${editing ? 'editing' : ''}`}
      data-id={obj.id}
      style={{ left: x * scale, top: y * scale, width: w * scale }}
      onPointerDown={(e) => {
        if (!active || editing) { if (editing) e.stopPropagation(); return; }
        e.stopPropagation();
        onStartEdit({ x: e.clientX, y: e.clientY });
      }}
    >
      {editing ? <LiveText obj={obj} click={click} isNew={isNew} onDone={onDone} /> : <StaticText doc={obj.doc} />}
      {active && (
        <>
          <span className="tb-grip" title="Przesuń" onPointerDown={(e) => startDrag(e, 'move')}>⠿</span>
          <span className="tb-resize" title="Szerokość" onPointerDown={(e) => startDrag(e, 'resize')} />
        </>
      )}
    </div>
  );
});

interface LayerProps {
  pageId: ID;
  texts: TextObj[];
  scale: number;
  /** narzędzie „Tekst” wybrane – bloki są klikalne */
  active: boolean;
}

export function TextLayer({ pageId, texts, scale, active }: LayerProps) {
  const [editing, setEditing] = useState<{ id: ID; click: { x: number; y: number } | null; isNew: boolean } | null>(null);
  const layer = useRef<HTMLDivElement>(null);

  // Zmiana narzędzia kończy edycję.
  useEffect(() => { if (!active) setEditing(null); }, [active]);

  const onPointerDown = async (e: React.PointerEvent) => {
    if (!active || e.target !== layer.current) return;
    e.preventDefault();
    // pierwszy klik obok zamyka edycję (jak w OneNote); jeśli blok już zniknął – tworzymy nowy od razu
    if (editing && texts.some((t) => t.id === editing.id)) { setEditing(null); return; }
    const r = layer.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / scale;
    const y = (e.clientY - r.top) / scale;
    const bx = Math.max(2, Math.min(PAGE_W - 25, Math.round(x)));
    const obj: TextObj = {
      id: newId(),
      pageId,
      type: 'text',
      x: bx,
      y: Math.max(0, Math.floor(y / LINE) * LINE),
      w: Math.max(25, Math.min(120, PAGE_W - 8 - bx)),
      doc: emptyDoc(),
      z: nextZ(),
      updatedAt: 0,
      deleted: 0,
      dirty: 1,
    };
    await putObjects([obj]);
    setEditing({ id: obj.id, click: null, isNew: true });
  };

  return (
    <div ref={layer} className={`text-layer ${active ? 'active' : ''}`} onPointerDown={onPointerDown}>
      {texts.map((t) => (
        <TextBlock
          key={t.id}
          obj={t}
          scale={scale}
          active={active}
          editing={editing?.id === t.id}
          isNew={editing?.id === t.id && editing.isNew}
          click={editing?.id === t.id ? editing.click : null}
          onStartEdit={(click) => setEditing({ id: t.id, click, isNew: false })}
          onDone={() => setEditing((cur) => (cur?.id === t.id ? null : cur))}
        />
      ))}
    </div>
  );
}
