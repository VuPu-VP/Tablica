import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Okno modalne oparte na natywnym <dialog> (Esc zamyka, fokus zostaje w środku). */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'wide' : ''}`}
      onPointerDown={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-btn sm" onClick={onClose} aria-label="Zamknij"><Icon name="x" size={18} /></button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
