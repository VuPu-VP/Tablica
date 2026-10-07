import { useCallback, useEffect, useState } from 'react';

export type Tool = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'text';
export type EraserMode = 'stroke' | 'partial';

export interface ToolSettings {
  tool: Tool;
  penColor: string;
  penWidth: number; // mm
  hlColor: string;
  hlWidth: number; // mm
  eraserMode: EraserMode;
  eraserSize: number; // promień w mm
  /** Rysowanie palcem (iPhone bez rysika). Na Yodze wyłączone: palec przewija, rysuje tylko pióro. */
  fingerDraw: boolean;
  /** Linijka: pióro i zakreślacz rysują proste linie (kąt przyciągany co 15°). */
  ruler: boolean;
  /** Grubość pióra zależna od nacisku rysika. Wyłączone = stała grubość jak długopis. */
  pressure: boolean;
}

export const PEN_COLORS = ['#1B1C1F', '#1F4FD8', '#D9342B', '#1E8A4C', '#8E44AD'];
export const HL_COLORS = ['#FFE066', '#A6E3A1', '#F5A3C7', '#9CC9F5'];
export const PEN_WIDTHS = [0.35, 0.6, 1.0];
export const HL_WIDTHS = [3, 5, 7];
export const ERASER_SIZES = [1.5, 3, 6];

const KEY = 'tablica.tools';

/** Urządzenie tylko dotykowe (telefon) – bez myszy i bez rysika. */
export const isTouchPrimary = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

const defaults = (): ToolSettings => ({
  tool: 'pen',
  penColor: PEN_COLORS[0],
  penWidth: PEN_WIDTHS[1],
  hlColor: HL_COLORS[0],
  hlWidth: HL_WIDTHS[1],
  eraserMode: 'partial',
  eraserSize: ERASER_SIZES[1],
  // palec domyślnie przewija (także na telefonie); rysowanie palcem włącza się przyciskiem z dłonią
  fingerDraw: false,
  ruler: false,
  pressure: true,
});

function load(): ToolSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // jednorazowo: starsze wersje włączały na telefonie rysowanie palcem (przewijanie tylko dwoma palcami)
      if (!localStorage.getItem(KEY + '.v2')) { saved.fingerDraw = false; localStorage.setItem(KEY + '.v2', '1'); }
      return { ...defaults(), ...saved };
    }
    localStorage.setItem(KEY + '.v2', '1');
  } catch { /* brak dostępu do localStorage – zostają domyślne */ }
  return defaults();
}

/** Ustawienia narzędzi zapamiętywane między uruchomieniami (localStorage = tylko to urządzenie). */
export function useToolSettings() {
  const [s, setS] = useState<ToolSettings>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignorujemy */ }
  }, [s]);
  const update = useCallback((patch: Partial<ToolSettings>) => setS((prev) => ({ ...prev, ...patch })), []);
  return [s, update] as const;
}
