import { nextZ, newId } from '../db/repo';
import { PAGE_W, type ID, type ImageObj } from '../db/types';
import { history } from '../ink/history';
import { toast } from '../ui/toast';
import { compressImage, storeBlob } from './blobs';

/**
 * Wstawia zdjęcie na stronę: szerokość maks. 120 mm (pionowe zdjęcia – maks. 150 mm wysokości),
 * wyśrodkowane w poziomie, na wysokości `y` (mm).
 */
export async function insertImage(file: Blob, pageId: ID, y = 20): Promise<ImageObj | undefined> {
  try {
    const { blob, width, height } = await compressImage(file);
    const blobId = await storeBlob(blob);
    let w = 120;
    let h = (w * height) / width;
    if (h > 150) { h = 150; w = (h * width) / height; }
    const obj: ImageObj = {
      id: newId(),
      pageId,
      type: 'image',
      x: Math.round(((PAGE_W - w) / 2) * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
      rotation: 0,
      blobId,
      z: nextZ(),
      updatedAt: 0,
      deleted: 0,
      dirty: 1,
    };
    await history.add([obj]);
    return obj;
  } catch (e) {
    toast('Nie udało się wstawić obrazu: ' + (e as Error).message, 'error');
  }
}

/** Otwiera systemowy wybór pliku (albo aparat na telefonie). */
export function pickFiles(accept: string, opts: { capture?: boolean; multiple?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = !!opts.multiple;
    if (opts.capture) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}
