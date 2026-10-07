import { describe, expect, it } from 'vitest';
import { parseRange } from '../src/export/range';

describe('zakres stron do eksportu', () => {
  it('pojedyncze strony i przedziały', () => {
    expect(parseRange('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
  });
  it('otwarte przedziały i odwrócona kolejność', () => {
    expect(parseRange('8-', 10)).toEqual([7, 8, 9]);
    expect(parseRange('-2', 10)).toEqual([0, 1]);
    expect(parseRange('3-1', 10)).toEqual([0, 1, 2]);
  });
  it('pomija numery spoza zeszytu i śmieci', () => {
    expect(parseRange('0, 2, 99, abc, 2', 5)).toEqual([1]);
  });
});
