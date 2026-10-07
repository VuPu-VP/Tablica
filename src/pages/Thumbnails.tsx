import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { copyPage, createPage, deletePage, listObjects, listPages, movePage, setPageBackground } from '../db/repo';
import { PAGE_H, PAGE_W, type Background, type ID, type Page } from '../db/types';
import { useBlobUrl } from '../import/blobs';
import { drawDiagramsApprox, drawImagePlaceholders, drawStrokes, drawTextsApprox } from '../ink/render';
import { NotebookPicker } from '../library/NotebookPicker';
import { Icon } from '../ui/Icon';
import { useMenu } from '../ui/Menu';
import { toast } from '../ui/toast';
import { BACKGROUND_LABELS } from './background';

const THUMB_W = 84;
const S = THUMB_W / PAGE_W; // px na mm w miniaturze

const Thumb = memo(function Thumb({ page }: { page: Page }) {
  const objects = useLiveQuery(() => listObjects(page.id), [page.id]);
  const ref = useRef<HTMLCanvasElement>(null);
  const pdfUrl = useBlobUrl(page.pdf?.blobId);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !objects) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(THUMB_W * dpr);
    c.height = Math.round(PAGE_H * S * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    drawImagePlaceholders(ctx, objects);
    drawDiagramsApprox(ctx, objects);
    drawTextsApprox(ctx, objects);
    drawStrokes(ctx, objects);
  }, [objects]);
  return <canvas ref={ref} style={pdfUrl ? { backgroundImage: `url(${pdfUrl})`, backgroundSize: '100% auto', backgroundRepeat: 'no-repeat' } : undefined} />;
});

interface Props {
  notebookId: ID;
  currentPageId: ID | undefined;
  onJump: (pageId: ID) => void;
}

export function Thumbnails({ notebookId, currentPageId, onJump }: Props) {
  const pages = useLiveQuery(() => listPages(notebookId), [notebookId]);
  const menu = useMenu();
  const [picker, setPicker] = useState<{ page: Page; mode: 'move' | 'copy' } | null>(null);
  const [drag, setDrag] = useState<{ id: ID; dropIndex: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const suppressClick = useRef(false);

  const insertAfter = async (after: ID | null) => {
    const p = await createPage(notebookId, after);
    onJump(p.id);
  };

  const pageMenu = (e: React.MouseEvent, p: Page) =>
    menu.open(e, [
      { label: 'Wstaw pustą stronę po', icon: 'plus', onClick: () => insertAfter(p.id) },
      { label: 'Duplikuj stronę', icon: 'copy', onClick: async () => { const c = await copyPage(p.id, notebookId, p.id); if (c) onJump(c.id); } },
      { label: 'Przenieś do zeszytu…', icon: 'notebook', onClick: () => setPicker({ page: p, mode: 'move' }) },
      { label: 'Kopiuj do zeszytu…', icon: 'notebook', onClick: () => setPicker({ page: p, mode: 'copy' }) },
      'separator',
      ...(['grid', 'dots', 'blank'] as Background[]).map((bg) => ({
        label: (p.background === bg ? '✓ ' : '') + 'Tło: ' + BACKGROUND_LABELS[bg],
        onClick: () => setPageBackground(p.id, bg),
      })),
      'separator',
      {
        label: 'Usuń stronę',
        icon: 'trash' as const,
        danger: true,
        onClick: () => { if (confirm('Usunąć tę stronę?')) deletePage(p.id); },
      },
    ]);

  const onPick = async (target: ID) => {
    if (!picker) return;
    const { page, mode } = picker;
    if (mode === 'copy') {
      await copyPage(page.id, target, 'end');
      toast('Skopiowano stronę na koniec wybranego zeszytu');
    } else {
      const last = (await listPages(target)).filter((x) => x.id !== page.id).at(-1);
      await movePage(page.id, target, last?.id ?? null);
      toast('Przeniesiono stronę na koniec wybranego zeszytu');
    }
  };

  // ---------- przeciąganie miniatur (rysik/mysz) ----------
  const dropIndexAt = (clientY: number) => {
    const thumbs = [...(navRef.current?.querySelectorAll<HTMLElement>('[data-thumb-id]') ?? [])];
    const i = thumbs.findIndex((t) => { const r = t.getBoundingClientRect(); return clientY < r.top + r.height / 2; });
    return i === -1 ? thumbs.length : i;
  };

  const onThumbPointerDown = (e: React.PointerEvent, p: Page) => {
    if (e.pointerType === 'touch' || e.button !== 0 || !pages) return;
    const sy = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientY - sy) < 8) return;
      dragging = true;
      setDrag({ id: p.id, dropIndex: dropIndexAt(ev.clientY) });
    };
    const up = async (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!dragging) return;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      const idx = dropIndexAt(ev.clientY);
      setDrag(null);
      const others = pages.filter((x) => x.id !== p.id);
      const from = pages.findIndex((x) => x.id === p.id);
      const target = idx > from ? idx - 1 : idx; // indeks w liście bez przeciąganej strony
      if (target === from) return;
      await movePage(p.id, notebookId, target > 0 ? others[target - 1].id : null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <nav className="thumbs" aria-label="Strony" ref={navRef}>
      <div className="label-caps" style={{ flex: 'none', marginBottom: 6 }}>Strony · {pages?.length ?? 0}</div>
      <button className="insert-here" title="Wstaw stronę na początku" onClick={() => insertAfter(null)}>
        <span><Icon name="plus" size={14} /></span>
      </button>
      {pages?.map((p, i) => (
        <div key={p.id} style={{ display: 'contents' }}>
          {drag && drag.dropIndex === i && drag.id !== p.id && <div className="drop-line" />}
          <button
            data-thumb-id={p.id}
            className={`thumb ${p.id === currentPageId ? 'selected' : ''} ${drag?.id === p.id ? 'dragging' : ''}`}
            onPointerDown={(e) => onThumbPointerDown(e, p)}
            onClick={() => { if (!suppressClick.current) onJump(p.id); }}
            onContextMenu={(e) => pageMenu(e, p)}
            aria-current={p.id === currentPageId ? 'page' : undefined}
            title="Przeciągnij, aby zmienić kolejność · prawy przycisk: opcje"
          >
            <Thumb page={p} />
            <span className="num">{i + 1}</span>
          </button>
          <button className="insert-here" title={`Wstaw stronę po ${i + 1}`} onClick={() => insertAfter(p.id)}>
            <span><Icon name="plus" size={14} /></span>
          </button>
        </div>
      ))}
      {drag && drag.dropIndex === pages?.length && <div className="drop-line" />}
      {menu.element}
      {picker && (
        <NotebookPicker
          title={picker.mode === 'move' ? 'Przenieś stronę do zeszytu' : 'Kopiuj stronę do zeszytu'}
          currentId={notebookId}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </nav>
  );
}
