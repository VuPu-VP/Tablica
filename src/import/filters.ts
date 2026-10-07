// Filtry zdjęć (operacje na pikselach RGBA) – działają tak samo w każdej przeglądarce,
// bez polegania na `ctx.filter`, którego starsze Safari nie obsługuje.

export type ImageFilter = 'none' | 'contrast' | 'scan' | 'chalk' | 'bw';

export const FILTER_LABELS: Record<ImageFilter, string> = {
  none: 'Oryginał',
  contrast: 'Kontrast',
  scan: 'Skan',
  chalk: 'Kreda',
  bw: 'Czarno-białe',
};

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Percentyl jasności (np. 0.02 = poziom „czerni”, 0.9 = poziom tła kartki). */
export function lumPercentile(px: Uint8ClampedArray, p: number): number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < px.length; i += 4 * 3) { hist[Math.round(lum(px[i], px[i + 1], px[i + 2]))]++; n++; } // co 3. piksel wystarczy
  const target = n * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
  return 255;
}

/**
 * Szacuje lokalną jasność tła (kartki/tablicy) w każdym miejscu zdjęcia:
 * dzielimy obraz na kratki, bierzemy najjaśniejszy piksel w kratce (tło jest jaśniejsze od pisma),
 * wygładzamy siatkę i interpolujemy. Dzięki temu cień z jednej strony zdjęcia nie psuje wyniku.
 */
export function estimateBackground(L: Float32Array, w: number, h: number): (x: number, y: number) => number {
  const cs = Math.max(8, Math.round(Math.min(w, h) / 40));
  const gw = Math.ceil(w / cs), gh = Math.ceil(h / cs);
  let grid = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const gy = Math.floor(y / cs);
    for (let x = 0; x < w; x++) {
      const i = gy * gw + Math.floor(x / cs);
      const v = L[y * w + x];
      if (v > grid[i]) grid[i] = v;
    }
  }
  // dwa przejścia rozmycia 3×3 (średnia) – wygładza siatkę i uzupełnia kratki zasłonięte pismem
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x >= 0 && y >= 0 && x < gw && y < gh) { s += grid[y * gw + x]; n++; }
      }
      out[gy * gw + gx] = s / n;
    }
    grid = out;
  }
  return (x, y) => {
    const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cs - 0.5));
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cs - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const a = grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx;
    const b = grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx;
    return Math.max(1, a * (1 - ty) + b * ty);
  };
}

/**
 * Filtr w miejscu (modyfikuje tablicę pikseli o wymiarach w × h).
 *  • contrast – mocniejsze kolory i kontrast,
 *  • scan     – „skan”: tło kartki/tablicy → białe (także przy nierównym świetle), pismo zostaje w kolorze,
 *  • chalk    – tablica kredowa: odwrócenie (ciemna tablica → biała kartka, kreda → ciemne pismo),
 *  • bw       – skan w odcieniach szarości.
 */
export function applyFilter(px: Uint8ClampedArray, f: ImageFilter, w: number, h: number) {
  if (f === 'none') return;
  if (f === 'contrast') {
    for (let i = 0; i < px.length; i += 4) {
      px[i] = clamp((px[i] - 128) * 1.35 + 138);
      px[i + 1] = clamp((px[i + 1] - 128) * 1.35 + 138);
      px[i + 2] = clamp((px[i + 2] - 128) * 1.35 + 138);
    }
    return;
  }
  if (f === 'chalk') {
    for (let i = 0; i < px.length; i += 4) { px[i] = 255 - px[i]; px[i + 1] = 255 - px[i + 1]; px[i + 2] = 255 - px[i + 2]; }
  }
  const L = new Float32Array(w * h);
  for (let p = 0, i = 0; p < L.length; p++, i += 4) L[p] = lum(px[i], px[i + 1], px[i + 2]);
  const bg = estimateBackground(L, w, h);
  const gray = f === 'bw' || f === 'chalk';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    // dzielenie przez tło: tło → 255, pismo zostaje ciemniejsze; 10% zapasu na niedokładność szacunku tła
    const k = (255 / bg(x, y)) * 1.1;
    const n = clamp(L[p] * k);
    if (n > 228) { px[i] = px[i + 1] = px[i + 2] = 255; continue; } // czyste białe tło
    if (gray) {
      const g = 255 * Math.pow(n / 255, 2.2); // przyciemnia pismo
      px[i] = px[i + 1] = px[i + 2] = g;
    } else {
      for (let c = 0; c < 3; c++) px[i + c] = 255 * Math.pow(clamp(px[i + c] * k) / 255, 1.8);
    }
  }
}
