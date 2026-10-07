import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { deleteObjects, newId, nextZ, putObjects } from '../db/repo';
import { INBOX_PAGE, type ImageObj } from '../db/types';
import { syncNow } from '../sync/runner';
import { toast } from '../ui/toast';
import { compressImage, storeBlob } from './blobs';

// Skrzynka zdjęć: telefon wrzuca, laptop wstawia na kartki.
// Zdjęcia w skrzynce to obrazy na „stronie” INBOX_PAGE, więc synchronizują się jak zwykła strona.

/** Zdjęcia w skrzynce, najnowsze na górze. */
export function useInbox(): ImageObj[] {
  return useLiveQuery(
    async () => (await db.objects.where('pageId').equals(INBOX_PAGE).toArray())
      .filter((o): o is ImageObj => o.type === 'image' && !o.deleted)
      .sort((a, b) => b.z - a.z),
    [],
  ) ?? [];
}

/** Telefon: zdjęcia z aparatu/galerii → skrzynka → od razu synchronizacja. */
export async function addToInbox(files: File[]) {
  if (!files.length) return;
  let n = 0;
  for (const f of files) {
    try {
      const { blob, width, height } = await compressImage(f);
      const blobId = await storeBlob(blob);
      const w = 120;
      const item: ImageObj = {
        id: newId(), pageId: INBOX_PAGE, type: 'image', x: 0, y: 0, w, h: Math.round((w * height) / width * 10) / 10,
        rotation: 0, blobId, z: nextZ(), updatedAt: 0, deleted: 0, dirty: 1,
      };
      await putObjects([item]);
      n++;
    } catch (e) {
      toast('Nie udało się dodać zdjęcia: ' + (e as Error).message, 'error');
    }
  }
  if (n) {
    toast(n === 1 ? 'Zdjęcie w skrzynce – pojawi się na laptopie' : `${n} zdjęć w skrzynce – pojawią się na laptopie`);
    syncNow(); // nie czekamy 4 s – wysyłamy od razu
  }
}

/** Zdjęcie ze skrzynki na kartce: nowy obiekt na stronie, a pozycja w skrzynce znika. */
export async function placeFromInbox(item: ImageObj, pageId: string, x: number, y: number): Promise<ImageObj> {
  const placed: ImageObj = { ...item, id: newId(), pageId, x, y, z: nextZ(), updatedAt: 0, dirty: 1 };
  await putObjects([placed]);
  await deleteObjects([item.id]);
  return placed;
}

export const removeFromInbox = (item: ImageObj) => deleteObjects([item.id]);
