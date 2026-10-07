import { useCallback, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type MenuItem =
  | { label: string; icon?: IconName; danger?: boolean; onClick: () => void }
  | 'separator';

interface MenuState { x: number; y: number; items: MenuItem[] }

/** Prosty hook menu kontekstowego: `open(event, items)` pokazuje menu przy kursorze/palcu. */
export function useMenu() {
  const [state, setState] = useState<MenuState | null>(null);
  const open = useCallback((e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }, items: MenuItem[]) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 40 * items.length - 16);
    setState({ x, y: Math.max(8, y), items });
  }, []);
  const close = useCallback(() => setState(null), []);
  const element: ReactNode = state && (
    <>
      <div className="menu-backdrop" onPointerDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div className="menu" style={{ left: state.x, top: state.y }} role="menu">
        {state.items.map((it, i) =>
          it === 'separator' ? (
            <hr key={i} />
          ) : (
            <button key={i} role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { close(); it.onClick(); }}>
              {it.icon && <Icon name={it.icon} size={16} />}
              {it.label}
            </button>
          ),
        )}
      </div>
    </>
  );
  return { open, close, element };
}
