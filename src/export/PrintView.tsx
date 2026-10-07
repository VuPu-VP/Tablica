import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { listObjects } from '../db/repo';
import { PAGE_H, PAGE_W, type Background, type ID, type Page, type PageObject, type StrokeObj } from '../db/types';
import { blobUrl } from '../import/blobs';
import { strokeOutline, svgPathFromOutline } from '../ink/render';
import { StaticText } from '../text/TextLayer';
import { CircuitSvg } from '../diagrams/CircuitSvg';
import { PlotSvg } from '../diagrams/PlotSvg';

export interface PrintJob {
  pages: Page[];
  withBackground: boolean;
  /** Proponowana nazwa pliku PDF (przeglądarka bierze ją z tytułu dokumentu). */
  title: string;
}

/** Tło w milimetrach – w druku linie kratki mają 0,2 mm niezależnie od ekranu. */
function printBackground(bg: Background): CSSProperties {
  if (bg === 'grid') {
    return {
      backgroundImage: 'linear-gradient(#cfd8e6 0.2mm, transparent 0.2mm), linear-gradient(90deg, #cfd8e6 0.2mm, transparent 0.2mm)',
      backgroundSize: '5mm 5mm',
    };
  }
  if (bg === 'dots') {
    return { backgroundImage: 'radial-gradient(circle, #a9b6c9 0.35mm, transparent 0.45mm)', backgroundSize: '5mm 5mm', backgroundPosition: '-2.5mm -2.5mm' };
  }
  return {};
}

function PrintPage({ page, objects, urls, withBackground }: { page: Page; objects: PageObject[]; urls: Map<ID, string>; withBackground: boolean }) {
  const strokes = objects.filter((o): o is StrokeObj => o.type === 'stroke');
  const path = (s: StrokeObj) => svgPathFromOutline(strokeOutline(s));
  return (
    <div className="print-page" style={{ ['--mm' as string]: '1mm' }}>
      {withBackground && !page.pdf && <div className="page-bg" style={printBackground(page.background)} />}
      {page.pdf && urls.get(page.pdf.blobId) && <img className="print-pdf" src={urls.get(page.pdf.blobId)} alt="" />}
      {objects.map((o) =>
        o.type === 'image' && urls.get(o.blobId) ? (
          <img key={o.id} className="page-image" src={urls.get(o.blobId)} alt="" style={{ left: `${o.x}mm`, top: `${o.y}mm`, width: `${o.w}mm`, height: `${o.h}mm` }} />
        ) : o.type === 'plot' || o.type === 'circuit' ? (
          o.type === 'plot'
            ? <PlotSvg key={o.id} p={o} style={{ position: 'absolute', left: `${o.x}mm`, top: `${o.y}mm`, width: `${o.w}mm`, height: `${o.h}mm` }} />
            : <CircuitSvg key={o.id} c={o} style={{ position: 'absolute', left: `${o.x}mm`, top: `${o.y}mm`, width: `${o.w}mm`, height: `${o.h}mm` }} />
        ) : o.type === 'text' ? (
          <div key={o.id} className="text-block" style={{ left: `${o.x}mm`, top: `${o.y}mm`, width: `${o.w}mm` }}>
            <StaticText doc={o.doc} />
          </div>
        ) : null,
      )}
      <svg className="print-ink" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} xmlns="http://www.w3.org/2000/svg">
        {strokes.filter((s) => s.tool === 'highlighter').map((s) => (
          <path key={s.id} d={path(s)} fill={s.color} fillOpacity={0.55} style={{ mixBlendMode: 'multiply' }} />
        ))}
        {strokes.filter((s) => s.tool === 'pen').map((s) => <path key={s.id} d={path(s)} fill={s.color} />)}
      </svg>
    </div>
  );
}

/**
 * Renderuje wybrane strony poza aplikacją (CSS @media print pokazuje tylko je)
 * i otwiera systemowe okno drukowania – stamtąd „Zapisz jako PDF”.
 */
export function PrintView({ job, onDone }: { job: PrintJob; onDone: () => void }) {
  const [data, setData] = useState<{ objects: Map<ID, PageObject[]>; urls: Map<ID, string> } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const objects = new Map<ID, PageObject[]>();
      const blobIds = new Set<ID>();
      for (const p of job.pages) {
        const objs = await listObjects(p.id);
        objects.set(p.id, objs);
        if (p.pdf) blobIds.add(p.pdf.blobId);
        objs.forEach((o) => { if (o.type === 'image') blobIds.add(o.blobId); });
      }
      const urls = new Map<ID, string>();
      await Promise.all([...blobIds].map(async (id) => { const u = await blobUrl(id); if (u) urls.set(id, u); }));
      if (alive) setData({ objects, urls });
    })();
    return () => { alive = false; };
  }, [job]);

  // Gdy wszystko wyrenderowane: czekamy na obrazy i czcionki, potem drukujemy.
  useLayoutEffect(() => {
    if (!data || !root.current) return;
    let cancelled = false;
    const prevTitle = document.title;
    const done = () => { document.title = prevTitle; window.removeEventListener('afterprint', done); onDone(); };
    (async () => {
      await Promise.all([...root.current!.querySelectorAll('img')].map((i) => i.decode().catch(() => undefined)));
      await document.fonts.ready;
      if (cancelled) return;
      document.title = job.title;
      window.addEventListener('afterprint', done);
      window.print();
      // Safari na iOS nie zawsze wysyła „afterprint” – sprzątamy też po chwili.
      setTimeout(() => { if (!cancelled) done(); }, 1500);
    })();
    return () => { cancelled = true; window.removeEventListener('afterprint', done); };
  }, [data, job, onDone]);

  return createPortal(
    <div className="print-root" ref={root} aria-hidden="true">
      {data && job.pages.map((p) => (
        <PrintPage key={p.id} page={p} objects={data.objects.get(p.id) ?? []} urls={data.urls} withBackground={job.withBackground} />
      ))}
    </div>,
    document.body,
  );
}
