import { useSyncExternalStore } from 'react';

// Krótkie powiadomienia na dole ekranu („Skopiowano…”).
interface Toast { id: number; text: string; kind: 'info' | 'error' }
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: nextId++, text, kind };
  toasts = [...toasts, t];
  emit();
  setTimeout(() => { toasts = toasts.filter((x) => x !== t); emit(); }, kind === 'error' ? 6000 : 3500);
}

export function Toasts() {
  const list = useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
