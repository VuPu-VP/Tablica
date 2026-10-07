import type { PageObject } from '../db/types';

// Schowek wewnętrzny aplikacji (kopiuj/wklej zaznaczenie między stronami i zeszytami).
let items: PageObject[] = [];
const listeners = new Set<() => void>();

export const clipboard = {
  get: () => items,
  set(objs: PageObject[]) {
    items = objs.map((o) => structuredClone(o));
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => { listeners.delete(f); };
  },
};
