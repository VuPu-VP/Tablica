import type { Editor } from '@tiptap/core';

// Aktualnie edytowany blok tekstu – żeby pasek narzędzi mógł pogrubiać, wstawiać wzory itd.
let active: Editor | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const activeEditor = {
  get: () => active,
  /** Zmienia się przy każdej zmianie zaznaczenia – pasek przerysowuje stan przycisków. */
  version: () => version,
  set(ed: Editor | null) {
    active = ed;
    this.bump();
  },
  bump() {
    version++;
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => { listeners.delete(f); };
  },
};
