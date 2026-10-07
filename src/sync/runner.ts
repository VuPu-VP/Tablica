import { liveQuery } from 'dexie';
import { db } from '../db/db';
import { toast } from '../ui/toast';
import { clearToken, getClientId, getToken, handleRedirectResult, isConnected } from './auth';
import { AuthError, DriveStore } from './drive';
import { syncOnce } from './engine';

// Kiedy synchronizujemy: po starcie, po powrocie internetu, po powrocie do aplikacji,
// kilka sekund po lokalnej zmianie i co 20 s, gdy aplikacja jest na ekranie (zdjęcia z telefonu,
// zmiany z drugiego urządzenia). Zwykle to jedno małe zapytanie o listę plików.

export type SyncState = 'off' | 'login' | 'syncing' | 'ok' | 'offline' | 'error';
export interface SyncStatus { state: SyncState; lastSync?: number; error?: string; pending: number }

let status: SyncStatus = { state: 'off', pending: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; listeners.forEach((f) => f()); };

export const syncStatus = {
  get: () => status,
  subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
};

let running = false;
let again = false;

export async function syncNow(): Promise<void> {
  if (!getClientId() || !isConnected()) return set({ state: 'off' });
  if (!navigator.onLine) return set({ state: 'offline' });
  if (!getToken()) return set({ state: 'login' });
  if (running) { again = true; return; }
  running = true;
  set({ state: 'syncing', error: undefined });
  try {
    await syncOnce(db, new DriveStore(getToken, db));
    set({ state: 'ok', lastSync: Date.now() });
  } catch (e) {
    if (e instanceof AuthError) { clearToken(); set({ state: 'login' }); }
    else set({ state: navigator.onLine ? 'error' : 'offline', error: (e as Error).message });
  } finally {
    running = false;
    if (again) { again = false; setTimeout(syncNow, 300); }
  }
}

let started = false;
export function startAutoSync() {
  if (started) return;
  started = true;
  const err = handleRedirectResult();
  if (err) toast(err, 'error');
  db.meta.get('sync.lastSync').then((m) => { if (m) set({ lastSync: m.value as number }); });

  syncNow();
  addEventListener('online', () => syncNow());
  addEventListener('offline', () => set({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 20_000);

  // Liczba niezsynchronizowanych zmian; po zmianie lokalnej – synchronizacja za 4 s (zbieramy kilka kresek naraz).
  let timer = 0;
  liveQuery(async () => {
    const counts = await Promise.all([db.subjects, db.notebooks, db.pages, db.objects].map((t) => t.where('dirty').equals(1).count()));
    return counts.reduce((a, b) => a + b, 0);
  }).subscribe((n) => {
    set({ pending: n });
    if (n > 0) { clearTimeout(timer); timer = window.setTimeout(syncNow, 4000); }
  });
}
