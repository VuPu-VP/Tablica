import { useEffect, useState } from 'react';
import { db } from '../db/db';
import type { ID } from '../db/types';

/** Zapisuje plik w bazie. ID = skrót SHA-256 treści, więc ten sam obraz zapisze się tylko raz. */
export async function storeBlob(data: Blob): Promise<ID> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await data.arrayBuffer())))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (!(await db.blobs.get(hash))) await db.blobs.put({ id: hash, mime: data.type, data, hash });
  return hash;
}

// Adresy blob: URL tworzymy raz na plik i trzymamy przez całą sesję.
const urls = new Map<ID, Promise<string | null>>();

export function blobUrl(id: ID): Promise<string | null> {
  let p = urls.get(id);
  if (!p) {
    p = db.blobs.get(id).then((b) => (b ? URL.createObjectURL(b.data) : null));
    urls.set(id, p);
    // jeśli pliku jeszcze nie ma (np. czeka na synchronizację) – spróbujemy ponownie następnym razem
    p.then((u) => { if (!u) urls.delete(id); });
  }
  return p;
}

export function useBlobUrl(id: ID | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) { setUrl(null); return; }
    blobUrl(id).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id]);
  return url;
}

/** Zmniejsza zdjęcie (dłuższy bok ≤ maxSide) i kompresuje: WebP, a gdy przeglądarka nie umie (Safari) – JPEG. */
export async function compressImage(file: Blob, maxSide = 2000): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k);
  const height = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; // przezroczystość (PNG) → białe tło jak na kartce
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
  let blob = await toBlob('image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  if (!blob) throw new Error('Nie udało się przetworzyć obrazu');
  return { blob, width, height };
}
