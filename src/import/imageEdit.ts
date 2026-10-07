import { db } from '../db/db';
import type { ID } from '../db/types';
import { canvasToBlob, storeBlob } from './blobs';
import { applyFilter, type ImageFilter } from './filters';

/** Kadr we współrzędnych 0..1 obrazu PO obrocie. */
export interface Crop { x: number; y: number; w: number; h: number }
export const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };

export interface ImageEdit {
  /** obrót w prawo o 0/90/180/270° */
  rotation: 0 | 90 | 180 | 270;
  crop: Crop;
  filter: ImageFilter;
}

/**
 * Rysuje obraz po obrocie, kadrowaniu i filtrze na canvas (o dłuższym boku ≤ maxSide).
 * Używane i do podglądu (mały maxSide), i do zapisu wyniku.
 */
export async function renderEdit(src: Blob, edit: ImageEdit, maxSide = 2000): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(src);
  const rotated = edit.rotation === 90 || edit.rotation === 270;
  const rw = rotated ? bmp.height : bmp.width; // rozmiar po obrocie
  const rh = rotated ? bmp.width : bmp.height;
  const cw = Math.max(1, Math.round(rw * edit.crop.w));
  const ch = Math.max(1, Math.round(rh * edit.crop.h));
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cw * k));
  c.height = Math.max(1, Math.round(ch * k));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  // układ: przesunięcie kadru → obrót → narysowanie oryginału
  ctx.scale(k, k);
  ctx.translate(-edit.crop.x * rw, -edit.crop.y * rh);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close();
  if (edit.filter !== 'none') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    applyFilter(data.data, edit.filter, c.width, c.height);
    ctx.putImageData(data, 0, 0);
  }
  return c;
}

/** Zapisuje edytowany obraz jako nowy plik; zwraca jego id i proporcję wysokość/szerokość. */
export async function saveEdit(srcBlobId: ID, edit: ImageEdit): Promise<{ blobId: ID; aspect: number }> {
  const src = await db.blobs.get(srcBlobId);
  if (!src) throw new Error('Brak pliku obrazu (czeka na synchronizację?)');
  const c = await renderEdit(src.data, edit);
  const blobId = await storeBlob(await canvasToBlob(c));
  return { blobId, aspect: c.height / c.width };
}
