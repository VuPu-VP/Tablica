import { generateKeyBetween } from 'fractional-indexing';
import { db } from '../db/db';
import { listPages, newId, touch } from '../db/repo';
import type { ID, Page } from '../db/types';
import { toast } from '../ui/toast';
import { storeBlob } from './blobs';

/** Szerokość renderu strony PDF w pikselach (~200 dpi dla A4) – ostre przy zoomie, rozsądny rozmiar pliku. */
const RENDER_W = 1650;

/**
 * Import PDF (np. slajdy z wykładu): każda strona PDF staje się tłem nowej strony A4,
 * wstawionej po stronie `afterPageId` (albo na końcu zeszytu). Po slajdach można pisać rysikiem.
 */
export async function importPdf(file: File, notebookId: ID, afterPageId: ID | null, onProgress?: (done: number, total: number) => void): Promise<ID | undefined> {
  // pdf.js jest duży (~1 MB) – ładujemy go dopiero przy pierwszym imporcie.
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const total = doc.numPages;

  // klucze kolejności: wszystkie nowe strony między `afterPageId` a następną stroną
  const pages = await listPages(notebookId);
  const idx = afterPageId ? pages.findIndex((p) => p.id === afterPageId) : pages.length - 1;
  let prev = idx >= 0 ? pages[idx].order : null;
  const next = pages[idx + 1]?.order ?? null;

  let firstId: ID | undefined;
  const canvas = document.createElement('canvas');
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RENDER_W / base.width });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Nie udało się wyrenderować strony ' + i);
    const blobId = await storeBlob(blob);
    const order = generateKeyBetween(prev, next);
    prev = order;
    const p: Page = touch({
      id: newId(),
      notebookId,
      order,
      background: 'blank',
      pdf: { blobId, pageIndex: i - 1, aspect: viewport.height / viewport.width, name: file.name },
      updatedAt: 0,
      deleted: 0,
      dirty: 1,
    });
    await db.pages.put(p);
    firstId ??= p.id;
    page.cleanup();
    onProgress?.(i, total);
  }
  await doc.loadingTask.destroy(); // zwalnia pamięć i wątek roboczy pdf.js
  toast(`Zaimportowano ${total} ${total === 1 ? 'stronę' : total < 5 ? 'strony' : 'stron'} z „${file.name}”`);
  return firstId;
}
