import { describe, expect, it } from 'vitest';
import { convertExpr, fractionize, slashToFrac, stripOuterParens } from '../src/text/fraction';

describe('ukośnik → ułamek', () => {
  it('prosty ułamek', () => {
    expect(slashToFrac('1/2')).toBe('\\frac{1}{2}');
    expect(slashToFrac('U/R')).toBe('\\frac{U}{R}');
  });
  it('nawiasy wokół licznika i mianownika znikają', () => {
    expect(slashToFrac('(a+b)/(c-d)')).toBe('\\frac{a+b}{c-d}');
  });
  it('ułamek piętrowy: a/b/c = (a/b)/c', () => {
    expect(slashToFrac('a/b/c')).toBe('\\frac{\\frac{a}{b}}{c}');
    expect(slashToFrac('1/(1/x)')).toBe('\\frac{1}{\\frac{1}{x}}');
  });
  it('ukośnik tylko w nawiasie i komendy LaTeX', () => {
    expect(slashToFrac('(1/2)')).toBe('\\frac{1}{2}');
    expect(slashToFrac('1/(2\\pi\\sqrt{LC})')).toBe('\\frac{1}{2\\pi\\sqrt{LC}}');
  });
  it('bez ukośnika → null', () => {
    expect(slashToFrac('abc')).toBeNull();
    expect(slashToFrac('/x')).toBeNull();
  });
  it('nawiasy zdejmowane tylko gdy obejmują całość', () => {
    expect(stripOuterParens('(a)(b)')).toBe('(a)(b)');
    expect(stripOuterParens('((a))')).toBe('(a)');
  });
  it('zaznaczenie z tekstem: zamienia tylko kawałki z ukośnikiem', () => {
    expect(fractionize('a + b/c')).toEqual([
      { type: 'text', text: 'a + ' },
      { type: 'mathInline', attrs: { latex: '\\frac{b}{c}' } },
    ]);
    expect(fractionize('wynik (a + b)/2 m')).toEqual([
      { type: 'text', text: 'wynik ' },
      { type: 'mathInline', attrs: { latex: '\\frac{a + b}{2}' } },
      { type: 'text', text: ' m' },
    ]);
  });
});

describe('ułamki a kolejność działań', () => {
  it('kod wzoru ze zrzutu: V=L dI/dt', () => {
    expect(convertExpr('V=L dI/dt')).toBe('V=L \\frac{dI}{dt}');
    expect(convertExpr('dI/dt')).toBe('\\frac{dI}{dt}');
  });
  it('= + − oddzielają człony, mnożenie zostaje w ułamku', () => {
    expect(convertExpr('I=U/R')).toBe('I=\\frac{U}{R}');
    expect(convertExpr('a-b/c+d')).toBe('a-\\frac{b}{c}+d');
    expect(convertExpr('V=LdI/dt')).toBe('V=\\frac{LdI}{dt}');
  });
  it('bez ukośnika – bez zmian', () => {
    expect(convertExpr('x^2+1')).toBeNull();
  });
  it('zwykły tekst: „I=U/R” → tekst „I=” i ułamek', () => {
    expect(fractionize('I=U/R')).toEqual([
      { type: 'text', text: 'I=' },
      { type: 'mathInline', attrs: { latex: '\\frac{U}{R}' } },
    ]);
  });
});
