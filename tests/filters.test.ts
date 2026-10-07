import { describe, expect, it } from 'vitest';
import { applyFilter, lumPercentile } from '../src/import/filters';

const W = 80, H = 60;

/**
 * Sztuczne zdjęcie W×H: tło z gradientem światła (bgLeft → bgRight, jak cień z jednej strony)
 * i pionowe „pismo” co 10 kolumn w odcieniu ink(bg).
 */
function photo(bgLeft: number, bgRight: number, ink: (bg: number) => number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const bg = bgLeft + ((bgRight - bgLeft) * x) / (W - 1);
    const v = x % 10 === 5 && y > 10 && y < 50 ? ink(bg) : bg;
    px.set([v, v, v, 255], (y * W + x) * 4);
  }
  return px;
}
const at = (px: Uint8ClampedArray, x: number, y: number) => px[(y * W + x) * 4];

describe('filtry zdjęć', () => {
  it('percentyle jasności', () => {
    const px = photo(180, 180, () => 60);
    expect(lumPercentile(px, 0.01)).toBe(60);
    expect(lumPercentile(px, 0.85)).toBe(180);
  });

  it('skan: szare tło kartki staje się białe, pismo zostaje ciemne', () => {
    const px = photo(180, 180, () => 60);
    applyFilter(px, 'scan', W, H);
    expect(at(px, 2, 30)).toBe(255);
    expect(at(px, 45, 30)).toBeLessThan(60);
  });

  it('skan przy nierównym świetle: tło białe po obu stronach (cień nie robi się czarny)', () => {
    const px = photo(110, 220, (bg) => bg * 0.35);
    applyFilter(px, 'scan', W, H);
    expect(at(px, 1, 30)).toBe(255); // ciemna strona tła
    expect(at(px, 78, 30)).toBe(255); // jasna strona tła
    expect(at(px, 5, 30)).toBeLessThan(80); // pismo w cieniu
    expect(at(px, 75, 30)).toBeLessThan(80); // pismo w świetle
  });

  it('kreda: ciemna tablica (z gradientem) z jasną kredą → białe tło, ciemne pismo', () => {
    const px = photo(40, 80, () => 225);
    applyFilter(px, 'chalk', W, H);
    expect(at(px, 1, 30)).toBe(255);
    expect(at(px, 78, 30)).toBe(255);
    expect(at(px, 45, 30)).toBeLessThan(80);
  });

  it('oryginał nic nie zmienia', () => {
    const px = photo(180, 180, () => 60);
    const copy = px.slice();
    applyFilter(px, 'none', W, H);
    expect(px).toEqual(copy);
  });
});
