import type { Table } from 'dexie';
import type { TablicaDB } from '../db/db';
import type { Base, ID, Notebook, Page, PageObject, Subject } from '../db/types';
import { forRemote, mergeById } from './merge';
import type { RemoteFile, RemoteStore } from './store';

// Jeden przebieg synchronizacji:
//  1. manifest.json  – przedmioty, zeszyty, strony (lista + nagrobki)
//  2. page-<id>.json – obiekty na stronie (kreski, tekst, obrazy)
//  3. blob-<sha256>  – pliki zdjęć i slajdów
// Plik zdalny czytamy tylko, gdy zmienił się od ostatniej synchronizacji (inna `version`)
// albo gdy mamy lokalne zmiany do scalenia. Dzięki temu zwykła synchronizacja to 1 zapytanie (lista plików).

interface Manifest { format: 1; subjects: Subject[]; notebooks: Notebook[]; pages: Page[] }

export interface SyncReport { uploaded: number; downloaded: number; files: number }

const MANIFEST = 'manifest.json';
const pageFile = (id: ID) => `page-${id}.json`;
const blobFile = (id: ID) => `blob-${id}`;
const json = (v: unknown) => new Blob([JSON.stringify(v)], { type: 'application/json' });

/** Zapisuje rekordy z Drive lokalnie – chyba że w międzyczasie lokalnie powstała jeszcze nowsza wersja. */
async function applyRemote<T extends Base>(db: TablicaDB, table: Table<T, string>, items: T[]) {
  if (!items.length) return;
  await db.transaction('rw', table, async () => {
    const current = await table.bulkGet(items.map((i) => i.id));
    const write = items.filter((r, i) => !current[i] || current[i]!.updatedAt <= r.updatedAt).map((r) => ({ ...r, dirty: 0 as const }));
    await table.bulkPut(write);
  });
}

/** Po wysłaniu zdejmuje znacznik „dirty” – ale tylko z wersji, które faktycznie wysłaliśmy. */
async function markClean<T extends Base>(db: TablicaDB, table: Table<T, string>, sent: T[]) {
  const ids = sent.filter((s) => s.dirty).map((s) => s.id);
  if (!ids.length) return;
  const sentAt = new Map(sent.map((s) => [s.id, s.updatedAt]));
  await db.transaction('rw', table, async () => {
    const current = await table.bulkGet(ids);
    const clean = current.filter((c): c is T => !!c && c.dirty === 1 && c.updatedAt === sentAt.get(c.id));
    await table.bulkPut(clean.map((c) => ({ ...c, dirty: 0 as const })));
  });
}

export async function syncOnce(db: TablicaDB, store: RemoteStore): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, downloaded: 0, files: 0 };
  const files = await store.list();
  report.files = files.length;
  const byName = new Map<string, RemoteFile>(files.map((f) => [f.name, f]));
  const versions: Record<string, string> = ((await db.meta.get('sync.versions'))?.value as Record<string, string>) ?? {};

  const put = async (name: string, data: Blob) => {
    const existing = byName.get(name);
    const f = existing ? await store.update(existing.id, name, data) : await store.create(name, data);
    byName.set(name, f);
    versions[name] = f.version;
    report.uploaded++;
  };

  // ---------- 1. manifest ----------
  const [subjects, notebooks, pages] = await Promise.all([db.subjects.toArray(), db.notebooks.toArray(), db.pages.toArray()]);
  const localDirty = [...subjects, ...notebooks, ...pages].some((e) => e.dirty);
  const mf = byName.get(MANIFEST);
  if (!mf || localDirty || versions[MANIFEST] !== mf.version) {
    let remote: Manifest = { format: 1, subjects: [], notebooks: [], pages: [] };
    if (mf) {
      remote = JSON.parse(await store.readText(mf.id));
      versions[MANIFEST] = mf.version;
      report.downloaded++;
    }
    const s = mergeById(subjects, remote.subjects);
    const n = mergeById(notebooks, remote.notebooks);
    const p = mergeById(pages, remote.pages);
    await applyRemote(db, db.subjects, s.toLocal);
    await applyRemote(db, db.notebooks, n.toLocal);
    await applyRemote(db, db.pages, p.toLocal);
    if (!mf || s.remoteChanged || n.remoteChanged || p.remoteChanged) {
      await put(MANIFEST, json({ format: 1, subjects: forRemote(s.merged), notebooks: forRemote(n.merged), pages: forRemote(p.merged) } satisfies Manifest));
    }
    await markClean(db, db.subjects, subjects);
    await markClean(db, db.notebooks, notebooks);
    await markClean(db, db.pages, pages);
  }

  // ---------- 2. strony ----------
  const candidates = new Set<ID>();
  (await db.objects.where('dirty').equals(1).toArray()).forEach((o) => candidates.add(o.pageId));
  for (const f of byName.values()) {
    const m = f.name.match(/^page-(.+)\.json$/);
    if (m && versions[f.name] !== f.version) candidates.add(m[1]);
  }
  for (const pageId of candidates) {
    const name = pageFile(pageId);
    const rf = byName.get(name);
    const local = await db.objects.where('pageId').equals(pageId).toArray();
    let remote: PageObject[] = [];
    if (rf) {
      remote = JSON.parse(await store.readText(rf.id));
      versions[name] = rf.version;
      report.downloaded++;
    }
    const r = mergeById(local, remote);
    await applyRemote(db, db.objects, r.toLocal);
    if (r.remoteChanged || (!rf && local.length)) await put(name, json(forRemote(r.merged)));
    await markClean(db, db.objects, local);
  }

  // ---------- 3. pliki (zdjęcia, slajdy) ----------
  const referenced = new Set<ID>();
  (await db.pages.toArray()).forEach((p) => { if (!p.deleted && p.pdf) referenced.add(p.pdf.blobId); });
  (await db.objects.toArray()).forEach((o) => {
    if (o.deleted || o.type !== 'image') return;
    referenced.add(o.blobId);
    if (o.orig) referenced.add(o.orig); // oryginał sprzed edycji – do „Przywróć oryginał” na innym urządzeniu
  });
  for (const id of referenced) {
    const name = blobFile(id);
    const local = await db.blobs.get(id);
    const rf = byName.get(name);
    if (local && !rf) {
      await put(name, local.data);
    } else if (!local && rf) {
      const data = await store.readBlob(rf.id);
      await db.blobs.put({ id, hash: id, mime: data.type, data });
      versions[name] = rf.version;
      report.downloaded++;
    }
  }

  await db.meta.put({ key: 'sync.versions', value: versions });
  await db.meta.put({ key: 'sync.lastSync', value: Date.now() });
  return report;
}
