// Generuje ikony PNG aplikacji bez zewnętrznych bibliotek: rysujemy piksele w pamięci
// i kodujemy je jako PNG (nagłówek + dane skompresowane zlibem + sumy CRC).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const ACCENT = [59, 91, 219];
const PAPER = [255, 255, 255];
const GRID = [214, 224, 238];
const INK = [31, 79, 216];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtr: brak
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Odległość punktu od odcinka – do narysowania „kreski” na kartce.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// Kształt ikony we współrzędnych 0..1: niebieskie tło, biała kartka A4 w kratkę, odręczna fala.
function icon(u, v, { rounded }) {
  if (rounded) {
    const r = 0.2, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
    if (Math.hypot(u - cx, v - cy) > r) return [0, 0, 0, 0];
  }
  const pw = 0.46, ph = pw * 297 / 210, px = 0.5 - pw / 2, py = 0.5 - ph / 2;
  if (u >= px && u <= px + pw && v >= py && v <= py + ph) {
    const lu = (u - px) / pw, lv = (v - py) / ph;
    const wave = [[0.15, 0.62], [0.3, 0.45], [0.45, 0.6], [0.6, 0.42], [0.75, 0.58], [0.86, 0.44]];
    for (let i = 1; i < wave.length; i++) {
      if (segDist(lu, lv * ph / pw, wave[i - 1][0], wave[i - 1][1] * ph / pw, wave[i][0], wave[i][1] * ph / pw) < 0.045) return [...INK, 255];
    }
    const cell = 1 / 8;
    if ((lu % cell) < 0.018 || ((lv * ph / pw) % cell) < 0.018) return [...GRID, 255];
    return [...PAPER, 255];
  }
  return [...ACCENT, 255];
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, (u, v) => icon(u, v, { rounded: false })));
writeFileSync('public/icon-512.png', png(512, (u, v) => icon(u, v, { rounded: false })));
writeFileSync('public/apple-touch-icon.png', png(180, (u, v) => icon(u, v, { rounded: false })));
writeFileSync('public/favicon-64.png', png(64, (u, v) => icon(u, v, { rounded: true })));
writeFileSync('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill="#3B5BDB"/><rect x="17.3" y="10.3" width="29.4" height="41.5" rx="1.5" fill="#fff"/><path d="M21.7 33 26 28.2l4.4 4.7 4.4-5.6 4.4 5.2 3.2-4.2" fill="none" stroke="#1F4FD8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`);
console.log('Ikony zapisane w public/');
