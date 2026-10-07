/**
 * Zakres stron wpisany przez użytkownika: „1-3, 5, 8-” → indeksy od 0.
 * Numery spoza zeszytu są pomijane, duplikaty usuwane, kolejność rosnąca.
 */
export function parseRange(input: string, total: number): number[] {
  const out = new Set<number>();
  for (const part of input.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$/);
    if (m) {
      const a = m[1] ? parseInt(m[1], 10) : 1;
      const b = m[2] ? parseInt(m[2], 10) : total;
      for (let i = Math.max(1, Math.min(a, b)); i <= Math.min(total, Math.max(a, b)); i++) out.add(i - 1);
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return [...out].sort((x, y) => x - y);
}
