import { describe, expect, it } from 'vitest';
import { appendLatex, collectVars, evaluate, formatNumber, solve } from '../src/text/calc';

describe('kalkulator – działania', () => {
  it('kolejność działań i nawiasy', () => {
    expect(evaluate('2+3*4')).toBe(14);
    expect(evaluate('(2+3)·4')).toBe(20);
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('-2^2')).toBe(-4);
    expect(evaluate('6:2')).toBe(3);
    expect(evaluate('10 − 4 × 2')).toBe(2);
  });
  it('przecinek dziesiętny i mnożenie bez znaku', () => {
    expect(evaluate('2,5*2')).toBe(5);
    expect(evaluate('2(3+1)')).toBe(8);
    expect(evaluate('2π')).toBeCloseTo(2 * Math.PI);
  });
  it('LaTeX', () => {
    expect(evaluate('\\frac{1}{2}+\\frac{1}{3}')).toBeCloseTo(5 / 6);
    expect(evaluate('\\sqrt{16} \\cdot 2')).toBe(8);
    expect(evaluate('\\sqrt[3]{27}')).toBeCloseTo(3);
    expect(evaluate('2^{10}')).toBe(1024);
    expect(evaluate('\\left(1+2\\right)^2')).toBe(9);
    expect(evaluate('2{,}5 \\times 4')).toBe(10);
  });
  it('funkcje, stopnie, silnia, procenty', () => {
    expect(evaluate('sin 30°')).toBe(0.5);
    expect(evaluate('\\cos(60^\\circ)')).toBe(0.5);
    expect(evaluate('tg 45°')).toBe(1);
    expect(evaluate('\\log_{2} 8')).toBeCloseTo(3);
    expect(evaluate('ln e')).toBe(1);
    expect(evaluate('5!')).toBe(120);
    expect(evaluate('20% * 50')).toBe(10);
    expect(evaluate('|3-5|')).toBe(2);
  });
  it('błędy', () => {
    expect(() => evaluate('1/0')).toThrow('Dzielenie przez zero');
    expect(() => evaluate('2+')).toThrow('Niedokończone');
    expect(() => evaluate('2 x 3')).toThrow('mnożenie');
    expect(() => evaluate('a+1')).toThrow('Nieznana zmienna „a”');
  });
});

describe('kalkulator – wybór działania i zmienne', () => {
  it('bierze działanie z końca zdania', () => {
    expect(solve('Wynik: 2+3 =')).toEqual({ value: 5, trailing: true });
    expect(solve('Zadanie 5: 2+3')).toEqual({ value: 5, trailing: false });
    expect(solve('x = 2+3·4 =').value).toBe(14);
  });
  it('zmienne z wcześniejszych linijek, jednostki są odcinane', () => {
    const vars = collectVars('Dane: m = 2 kg, v = 3 m/s\nE_k = m v^2/2\nα = 30°\nR1 = 4 \\Omega');
    expect(vars.get('m')).toBe(2);
    expect(vars.get('v')).toBe(3);
    expect(vars.get('Ek')).toBe(9);
    expect(vars.get('α')).toBeCloseTo(Math.PI / 6);
    expect(evaluate('E_k + R_1', vars)).toBe(13);
    expect(evaluate('\\sin\\alpha', vars)).toBe(0.5);
    expect(evaluate('mv', vars)).toBe(6);
  });
});

describe('kalkulator – formatowanie wyniku', () => {
  it('dokładnie, ułamek, przybliżenie', () => {
    expect(formatNumber(0.1 + 0.2).text).toBe('0,3');
    expect(formatNumber(1 / 3)).toMatchObject({ approx: false, text: '1/3 ≈ 0,3333', latex: '\\frac{1}{3} \\approx 0{,}3333' });
    expect(formatNumber(Math.SQRT2)).toMatchObject({ approx: true, text: '1,4142' });
    expect(formatNumber(1.6e-19)).toMatchObject({ approx: false, text: '1,6·10^-19' });
    expect(formatNumber(2.5, false).text).toBe('2.5');
  });
  it('dopisywanie do kodu wzoru', () => {
    expect(appendLatex('2+3')).toBe('2+3 = 5');
    expect(appendLatex('\\sqrt{2} =')).toBe('\\sqrt{2} \\approx 1{,}4142');
    expect(appendLatex('\\frac{1}{2}+\\frac{1}{3}')).toBe('\\frac{1}{2}+\\frac{1}{3} = \\frac{5}{6} \\approx 0{,}8333');
  });
});
