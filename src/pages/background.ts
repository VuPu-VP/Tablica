import type { CSSProperties } from 'react';
import type { Background } from '../db/types';

/** Tło strony jako gradienty CSS w skali (kratka/kropki co 5 mm) – nic nie trzeba rysować w canvasie. */
export function backgroundStyle(bg: Background, scale: number, color = 'var(--grid)'): CSSProperties {
  const step = 5 * scale;
  if (bg === 'grid') {
    return {
      backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
      backgroundSize: `${step}px ${step}px`,
      backgroundPosition: `-0.5px -0.5px`,
    };
  }
  if (bg === 'dots') {
    const r = Math.max(0.8, scale * 0.28);
    return {
      backgroundImage: `radial-gradient(circle, #a9b6c9 ${r}px, transparent ${r + 0.6}px)`,
      backgroundSize: `${step}px ${step}px`,
      backgroundPosition: `${-step / 2}px ${-step / 2}px`,
    };
  }
  return {};
}

export const BACKGROUND_LABELS: Record<Background, string> = {
  grid: 'Kratka 5 mm',
  dots: 'Kropki',
  blank: 'Czysta',
};
