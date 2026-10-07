import type { Base } from '../db/types';

/**
 * Scalanie dwóch wersji tego samego zbioru (lokalnej i z Google Drive) obiekt po obiekcie.
 * Zasada „ostatni zapis wygrywa” (last-writer-wins) działa osobno dla każdej kreski / bloku tekstu,
 * więc zmiany zrobione offline na dwóch urządzeniach w różnych miejscach strony się sumują.
 * Usunięcia to „nagrobki” (`deleted: 1`) z własnym czasem – też wygrywa nowsze.
 */
export interface MergeResult<T> {
  /** Pełny zbiór po scaleniu (do wysłania na Drive). */
  merged: T[];
  /** Rekordy z Drive nowsze od lokalnych – do zapisania w bazie lokalnej. */
  toLocal: T[];
  /** Czy plik na Drive trzeba nadpisać (lokalnie jest coś nowszego albo czego tam nie ma). */
  remoteChanged: boolean;
}

export function mergeById<T extends Base>(local: T[], remote: T[]): MergeResult<T> {
  const byId = new Map<string, T>();
  for (const r of remote) byId.set(r.id, r);
  const merged: T[] = [];
  const toLocal: T[] = [];
  let remoteChanged = false;
  const seen = new Set<string>();

  for (const l of local) {
    seen.add(l.id);
    const r = byId.get(l.id);
    if (!r) {
      merged.push(l);
      remoteChanged = true;
    } else if (r.updatedAt > l.updatedAt) {
      merged.push(r);
      toLocal.push(r);
    } else {
      merged.push(l);
      if (l.updatedAt > r.updatedAt) remoteChanged = true;
    }
  }
  for (const r of remote) {
    if (seen.has(r.id)) continue;
    merged.push(r);
    toLocal.push(r);
  }
  return { merged, toLocal, remoteChanged };
}

/** Wersja do zapisu na Drive: bez lokalnego znacznika „dirty”. */
export const forRemote = <T extends Base>(items: T[]): T[] => items.map((i) => ({ ...i, dirty: 0 as const }));
