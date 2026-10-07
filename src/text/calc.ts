import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';

// Kalkulator działań pisanych z klawiatury: „2+3·4 =” → „2+3·4 = 14”.
// Rozumie zwykły tekst i kod LaTeX (\frac, \sqrt, \cdot, ^{…}), polski przecinek dziesiętny,
// stopnie (30°), funkcje (sin, tg, ln, log…) i zmienne zapisane wcześniej w tym samym bloku („R = 4 Ω”).

export class CalcError extends Error {}

export type Vars = Map<string, number>;

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; name: string; sub?: string }
  | { t: 'frac' }
  | { t: 'sqrt' }
  | { t: 'op'; v: string };

const GREEK: Record<string, string> = Object.fromEntries(
  ('alpha α beta β gamma γ delta δ epsilon ε varepsilon ε zeta ζ eta η theta θ vartheta θ iota ι kappa κ ' +
    'lambda λ mu μ nu ν xi ξ pi π rho ρ sigma σ tau τ upsilon υ phi φ varphi φ chi χ psi ψ omega ω ' +
    'Gamma Γ Delta Δ Theta Θ Lambda Λ Xi Ξ Pi Π Sigma Σ Phi Φ Psi Ψ Omega Ω')
    .split(' ')
    .reduce<[string, string][]>((acc, w, i, all) => (i % 2 ? acc : [...acc, [w, all[i + 1]]]), []),
);

const DEG = Math.PI / 180;
/** Usuwa szum zmiennoprzecinkowy funkcji trygonometrycznych: sin 30° = 0,5, a nie 0,49999999999999994. */
const snap = (x: number) => (Math.abs(x) < 1e6 ? Math.round(x * 1e14) / 1e14 : x);
const tan = (x: number) => {
  const v = Math.tan(x);
  if (Math.abs(v) > 1e15) throw new CalcError('Tangens nie istnieje dla tego kąta');
  return snap(v);
};
const cot = (x: number) => {
  const v = Math.tan(x);
  if (Math.abs(v) < 1e-15) throw new CalcError('Cotangens nie istnieje dla tego kąta');
  return snap(1 / v);
};

const FUNCS: Record<string, (x: number) => number> = {
  sin: (x) => snap(Math.sin(x)),
  cos: (x) => snap(Math.cos(x)),
  tan, tg: tan,
  cot, ctg: cot, cotg: cot,
  arcsin: Math.asin, arccos: Math.acos,
  arctan: Math.atan, arctg: Math.atan,
  arccot: (x) => Math.PI / 2 - Math.atan(x), arcctg: (x) => Math.PI / 2 - Math.atan(x),
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log10, lg: Math.log10,
  exp: Math.exp,
  sqrt: (x) => root(x, 2),
  abs: Math.abs,
};

const CONSTS: Record<string, number> = { π: Math.PI, pi: Math.PI, e: Math.E };

function div(a: number, b: number) {
  if (b === 0) throw new CalcError('Dzielenie przez zero');
  return a / b;
}

function root(x: number, n: number) {
  if (x >= 0) return x ** (1 / n);
  if (Number.isInteger(n) && n % 2) return -((-x) ** (1 / n));
  throw new CalcError('Pierwiastek z liczby ujemnej');
}

function pow(b: number, e: number) {
  if (b < 0 && !Number.isInteger(e)) {
    const n = 1 / e; // np. (-8)^(1/3)
    if (Math.abs(n - Math.round(n)) < 1e-9) return root(b, Math.round(n));
    throw new CalcError('Potęga ułamkowa z liczby ujemnej');
  }
  return b ** e;
}

function fact(n: number) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new CalcError('Silnia tylko z liczb całkowitych 0…170');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Zamienia zapis LaTeX i znaki typograficzne na prostsze odpowiedniki. */
function prep(s: string): string {
  return s
    .replace(/\{,\}/g, ',')
    .replace(/\\(?:left|right|[bB]igg?[lr]?)(?![a-zA-Z])\s*/g, '')
    .replace(/\\[lr]?vert(?![a-zA-Z])/g, '|')
    .replace(/\^\s*\{?\s*\\circ\s*\}?/g, '°')
    .replace(/\\operatorname\s*\{\s*([a-zA-Z]+)\s*\}/g, '\\$1')
    .replace(/\\(?:[,;:! ]|q?quad(?![a-zA-Z]))/g, ' ')
    .replace(/\\(?:cdot|times|ast)(?![a-zA-Z])/g, '*')
    .replace(/\\div(?![a-zA-Z])/g, '/')
    .replace(/\\%/g, '%')
    .replace(/\\[dt]frac(?![a-zA-Z])/g, '\\frac')
    .replace(/[−–]/g, '-')
    .replace(/[×·⋅∙]/g, '*')
    .replace(/(?<=\S):(?=\s)/g, '\u0000') // „Zadanie 5: …” to etykieta, nie dzielenie
    .replace(/[÷:]/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');
}

function tokenize(src: string): Tok[] {
  const s = prep(src);
  const out: Tok[] = [];
  let i = 0;
  const subscript = (tok: Tok & { t: 'id' }) => {
    if (s[i] !== '_') return;
    if (s[i + 1] === '{') {
      const end = s.indexOf('}', i + 2);
      if (end < 0) throw new CalcError('Brakuje „}”');
      tok.sub = s.slice(i + 2, end).replace(/[\s{}]/g, '');
      i = end + 1;
    } else {
      const m = /^[\p{L}\d]+/u.exec(s.slice(i + 1));
      if (!m) throw new CalcError('Nie rozumiem „_”');
      tok.sub = m[0];
      i += 1 + m[0].length;
    }
  };
  while (i < s.length) {
    const ch = s[i];
    const rest = s.slice(i);
    if (/\s/.test(ch)) { i++; continue; }
    const num = /^(?:\d+(?:[.,]\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (num) {
      out.push({ t: 'num', v: parseFloat(num[0].replace(',', '.')) });
      i += num[0].length;
      continue;
    }
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+)/.exec(rest);
      if (!m) throw new CalcError(`Nie rozumiem „${rest.slice(0, 2)}”`);
      const name = m[1];
      i += m[0].length;
      if (name === 'frac') { out.push({ t: 'frac' }); continue; }
      if (name === 'sqrt') { out.push({ t: 'sqrt' }); continue; }
      if (['text', 'mathrm', 'rm', 'mbox', 'textrm'].includes(name)) throw new CalcError('Jednostki pomiń – policzę same liczby');
      const id = GREEK[name] ?? (FUNCS[name] ? name : null);
      if (!id) throw new CalcError(`Nie znam polecenia \\${name}`);
      const tok: Tok & { t: 'id' } = { t: 'id', name: id };
      subscript(tok);
      out.push(tok);
      continue;
    }
    const word = /^\p{L}[\p{L}\d]*/u.exec(rest);
    if (word) {
      i += word[0].length;
      const tok: Tok & { t: 'id' } = { t: 'id', name: word[0] };
      subscript(tok);
      out.push(tok);
      continue;
    }
    if (ch === '√') { out.push({ t: 'sqrt' }); i++; continue; }
    if ('+-*/^!%°()[]{}|'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    throw new CalcError(ch === '\u0000' ? 'Nie rozumiem „:”' : `Nie rozumiem znaku „${ch}”`);
  }
  return out;
}

const show = (t: Tok) => (t.t === 'num' ? String(t.v) : t.t === 'id' ? t.name : t.t === 'op' ? t.v : `\\${t.t}`);

/** Zejście rekurencyjne: + − → · / (i mnożenie bez znaku: 2πr) → potęga → !, %, ° → liczby, nawiasy, funkcje. */
class Parser {
  private i = 0;
  private absDepth = 0;
  constructor(private toks: Tok[], private vars: Vars) {}

  private peek() { return this.toks[this.i]; }
  private isOp(v: string) { const t = this.peek(); return t?.t === 'op' && t.v === v; }
  private eat(v: string) { if (!this.isOp(v)) return false; this.i++; return true; }
  private expect(v: string) {
    if (!this.eat(v)) throw new CalcError(this.peek() ? `Brakuje „${v}”` : 'Niedokończone działanie');
  }

  run(): number {
    if (!this.toks.length) throw new CalcError('Brak działania do policzenia');
    const v = this.expr();
    const t = this.peek();
    if (t) throw new CalcError(`Nie rozumiem „${show(t)}”`);
    return v;
  }

  private expr(): number {
    let v = this.term();
    for (;;) {
      if (this.eat('+')) v += this.term();
      else if (this.eat('-')) v -= this.term();
      else return v;
    }
  }

  /** Czy następny token może zacząć czynnik mnożenia bez znaku: 2x, 2(a+b), 3\sqrt{2}. */
  private startsFactor() {
    const t = this.peek();
    if (!t) return false;
    if (t.t !== 'op') return true;
    return '([{'.includes(t.v) || (t.v === '|' && this.absDepth === 0);
  }

  private term(): number {
    let v = this.unary();
    for (;;) {
      if (this.eat('*')) v *= this.unary();
      else if (this.eat('/')) v = div(v, this.unary());
      else if (this.startsFactor()) v *= this.power();
      else return v;
    }
  }

  private unary(): number {
    if (this.eat('-')) return -this.unary();
    if (this.eat('+')) return this.unary();
    return this.power();
  }

  private power(): number {
    const b = this.postfix();
    return this.eat('^') ? pow(b, this.unary()) : b;
  }

  private postfix(): number {
    let v = this.primary();
    for (;;) {
      if (this.eat('!')) v = fact(v);
      else if (this.eat('%')) v /= 100;
      else if (this.eat('°')) v *= DEG;
      else return v;
    }
  }

  /** Argument \frac i \sqrt: {…} albo pojedynczy czynnik. */
  private group(): number {
    return this.isOp('{') ? this.primary() : this.postfix();
  }

  private primary(): number {
    const t = this.peek();
    if (!t) throw new CalcError('Niedokończone działanie');
    this.i++;
    if (t.t === 'num') return t.v;
    if (t.t === 'frac') { const a = this.group(); return div(a, this.group()); }
    if (t.t === 'sqrt') {
      let n = 2;
      if (this.eat('[')) { n = this.expr(); this.expect(']'); }
      return root(this.group(), n);
    }
    if (t.t === 'id') return this.ident(t);
    const close = ({ '(': ')', '[': ']', '{': '}' } as Record<string, string>)[t.v];
    if (close) { const v = this.expr(); this.expect(close); return v; }
    if (t.v === '|') {
      this.absDepth++;
      const v = this.expr();
      this.expect('|');
      this.absDepth--;
      return Math.abs(v);
    }
    throw new CalcError(`Nie rozumiem „${t.v}”`);
  }

  private lookup(key: string): number | undefined {
    return this.vars.get(key) ?? CONSTS[key];
  }

  private ident(t: Tok & { t: 'id' }): number {
    const f = FUNCS[t.name];
    if (f) {
      const p = this.eat('^') ? this.postfix() : null; // \sin^2 x
      const arg = this.isOp('(') || this.isOp('{') || this.isOp('[') ? this.primary() : this.power();
      let v: number;
      if (t.sub && (t.name === 'log' || t.name === 'lg')) {
        const base = evaluate(t.sub, this.vars);
        if (base <= 0 || base === 1) throw new CalcError('Zła podstawa logarytmu');
        v = Math.log(arg) / Math.log(base);
      } else v = f(arg);
      if (!Number.isFinite(v)) throw new CalcError(`${t.name} – liczba spoza dziedziny`);
      return p === null ? v : pow(v, p);
    }
    const val = this.lookup(t.name + (t.sub ?? ''));
    if (val !== undefined) return val;
    // „mv” albo „πr” = iloczyn znanych jednoliterowych zmiennych
    const chars = [...t.name];
    if (!t.sub && chars.length > 1) {
      const vals = chars.map((c) => this.lookup(c));
      if (vals.every((x) => x !== undefined)) return (vals as number[]).reduce((a, b) => a * b, 1);
    }
    const name = t.sub ? `${t.name}_${t.sub}` : t.name;
    if (name === 'x') throw new CalcError('Nieznana zmienna „x” – mnożenie to * albo ·');
    throw new CalcError(`Nieznana zmienna „${name}” – wpisz ją wcześniej, np. ${name} = 5`);
  }
}

export function evaluate(expr: string, vars: Vars = new Map()): number {
  const v = new Parser(tokenize(expr), vars).run();
  if (!Number.isFinite(v)) throw new CalcError('Wynik nie jest liczbą');
  return v;
}

const EQ_END = /\s*(?:=|≈|\\approx)\s*$/;

/**
 * Wybiera działanie z końcówki tekstu i je liczy. Bierzemy to, co po ostatnim „=”, a z tego
 * najdłuższy kawałek, który da się policzyć: „Wynik: 2+3 =” → „2+3”.
 */
export function solve(text: string, vars: Vars = new Map()): { value: number; trailing: boolean } {
  const trailing = EQ_END.test(text);
  const t = text.replace(EQ_END, '');
  const parts = t.split(/=|≈|\\approx/);
  const expr = parts[parts.length - 1];
  const starts = [0];
  for (let i = 1; i < expr.length; i++) if (/\s/.test(expr[i - 1]) && !/\s/.test(expr[i])) starts.push(i);
  let err: unknown = null;
  for (const s of starts) {
    const cand = expr.slice(s);
    if (s > 0 && /^\s*[\d.,]+\s*$/.test(cand)) continue; // sama liczba z końca zdania to nie działanie
    try {
      return { value: evaluate(cand, vars), trailing };
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      err = e;
    }
  }
  throw err ?? new CalcError('Brak działania do policzenia');
}

/**
 * Zmienne z wcześniejszych linijek: „R = 4 Ω”, „m = 2 kg, v = 3 m/s”, „α = 30°”, „E_k = m v^2/2”.
 * Jednostka po liczbie (spacja + słowo) jest odcinana.
 */
export function collectVars(text: string): Vars {
  const vars: Vars = new Map();
  for (const stmt of text.split(/\n|;|,(?=\s)/)) {
    const parts = stmt.split(/=|≈|\\approx/);
    if (parts.length < 2) continue;
    const m = /(?:^|[\s:(,])((?:\\[a-zA-Z]+|\p{L}[\p{L}\d]*)(?:_\{[^{}]*\}|_[\p{L}\d]+)?)\s*$/u.exec(parts[0]);
    if (!m) continue;
    let toks: Tok[];
    try { toks = tokenize(m[1]); } catch { continue; }
    const id = toks[0];
    if (toks.length !== 1 || id.t !== 'id' || FUNCS[id.name]) continue;
    let rhs = parts[1].replace(/\\[,;: ]/g, ' ').replace(/[\s.,;:]+$/, '');
    const unit = /(?<=[\d)}°])\s+(?=(?!π)\p{L}|\\(?!(?:cdot|times|div|frac|sqrt|pi|left|sin|cos|tan|ln|log)(?![a-zA-Z]))[a-zA-Z])/u.exec(rhs);
    if (unit) rhs = rhs.slice(0, unit.index);
    try { vars.set(id.name + (id.sub ?? ''), evaluate(rhs, vars)); } catch { /* to nie była liczba */ }
  }
  return vars;
}

export interface Formatted {
  approx: boolean;
  text: string;
  latex: string;
  /** Wynik wygląda lepiej jako wzór (ułamek, potęga dziesięciu). */
  math: boolean;
}

const trimZeros = (s: string) => (s.includes('.') && !s.includes('e') ? s.replace(/\.?0+$/, '') : s);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.abs(b);

/** Ułamek zwykły p/q (q ≤ 1000) równy liczbie, np. 0,333… → 1/3. */
function asFraction(v: number): [number, number] | null {
  let [h0, h1, k0, k1, x] = [1, 0, 0, 1, v];
  for (let i = 0; i < 25; i++) {
    const a = Math.floor(x);
    [h0, h1] = [a * h0 + h1, h0];
    [k0, k1] = [a * k0 + k1, k0];
    if (k0 > 1000) return null;
    if (near(h0 / k0, v)) return k0 > 1 ? [h0, k0] : null;
    x = 1 / (x - a);
    if (!Number.isFinite(x)) return null;
  }
  return null;
}

/** Liczba do wpisania: dokładnie („= 0,3”), jako ułamek („= 1/3 ≈ 0,3333”) albo w przybliżeniu („≈ 1,4142”). */
export function formatNumber(v: number, comma = true): Formatted {
  const dec = (s: string) => (comma ? s.replace('.', ',') : s);
  const tex = (s: string) => s.replace(',', '{,}');
  const plain = (s: string, approx: boolean): Formatted => ({ approx, text: dec(s), latex: tex(dec(s)), math: false });
  if (v === 0) return plain('0', false);
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 1e15) return plain(String(v), false);
  if (a >= 1e12 || a < 1e-4) {
    let e = Math.floor(Math.log10(a));
    let m = v / 10 ** e;
    if (Math.abs(+m.toFixed(4)) >= 10) { e++; m /= 10; }
    const ms = trimZeros(m.toFixed(4));
    const approx = !near(+ms * 10 ** e, v);
    return { approx, text: `${dec(ms)}·10^${e}`, latex: `${tex(dec(ms))} \\cdot 10^{${e}}`, math: true };
  }
  const exact = trimZeros(v.toFixed(10));
  if (near(+exact, v)) return plain(exact, false);
  const ap = dec(a >= 1 ? trimZeros(v.toFixed(4)) : trimZeros(v.toPrecision(4)));
  const q = asFraction(v);
  if (q) {
    const [n, d] = q;
    return {
      approx: false,
      text: `${n}/${d} ≈ ${ap}`,
      latex: `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}} \\approx ${tex(ap)}`,
      math: true,
    };
  }
  return { approx: true, text: ap, latex: tex(ap), math: false };
}

/** Przecinek dziesiętny, chyba że w działaniu użyto kropki (3.14). */
const useComma = (text: string) => !/\d\.\d/.test(text);

/** Kod LaTeX z dopisanym wynikiem: „\frac{1}{2}+\frac{1}{3}” → „… = \frac{5}{6} \approx 0{,}8333”. */
export function appendLatex(latex: string, vars: Vars = new Map()): string {
  const { value, trailing } = solve(latex, vars);
  const r = formatNumber(value, useComma(latex));
  const base = latex.replace(/\s+$/, '');
  if (trailing) return `${r.approx ? base.replace(/=$/, '\\approx') : base} ${r.latex}`;
  return `${base} ${r.approx ? '\\approx' : '='} ${r.latex}`;
}

const leafText = (n: PMNode) =>
  n.type.name === 'mathInline' ? ` ${n.attrs.latex} ` : n.type.name === 'hardBreak' ? '\n' : '';

/** Zmienne z bloku tekstu aż do pozycji `upto`. */
export function docVars(editor: Editor, upto = editor.state.doc.content.size): Vars {
  return collectVars(editor.state.doc.textBetween(0, upto, '\n', leafText));
}

/**
 * Komenda edytora: liczy zaznaczenie (albo działanie przed kursorem, albo kliknięty wzór) i dopisuje wynik.
 * Zwraca komunikat błędu albo null, gdy się udało.
 */
export function calculate(editor: Editor): string | null {
  const { state } = editor;
  const sel = state.selection;
  try {
    if (sel instanceof NodeSelection && (sel.node.type.name === 'mathInline' || sel.node.type.name === 'mathBlock')) {
      const latex = appendLatex(sel.node.attrs.latex, docVars(editor, sel.from));
      editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(sel.from, undefined, { latex }); return true; }).run();
      return null;
    }
    const start = sel.$from.start();
    const to = sel.to;
    const text = state.doc.textBetween(sel.empty ? start : sel.from, to, ' ', leafText);
    const { value, trailing } = solve(text, docVars(editor, to));
    const r = formatNumber(value, useComma(text));

    const charAt = (p: number) => (p > start ? state.doc.textBetween(p - 1, p, '', '\u0000') : '');
    let p = to;
    while (/^\s$/.test(charAt(p))) p--;
    const chain = editor.chain().focus();
    // „√2 =” i wynik przybliżony → „√2 ≈ 1,4142”
    if (trailing && r.approx && charAt(p) === '=') chain.insertContentAt({ from: p - 1, to: p }, '≈');
    const space = charAt(to) && !/\s/.test(charAt(to)) ? ' ' : '';
    const sign = trailing ? '' : `${r.approx ? '≈' : '='} `;
    const content: JSONContent[] = r.math
      ? [{ type: 'text', text: space + sign }, { type: 'mathInline', attrs: { latex: r.latex } }]
      : [{ type: 'text', text: space + sign + r.text }];
    chain.insertContentAt(to, content.filter((c) => c.type !== 'text' || c.text)).run();
    return null;
  } catch (e) {
    if (e instanceof CalcError) return e.message;
    throw e;
  }
}

/** Pole kodu wzoru: liczy zaznaczony fragment (albo kod do kursora) i dopisuje wynik w LaTeX-u. */
export function calcInMathInput(el: HTMLInputElement | HTMLTextAreaElement, vars: Vars): string | null {
  const a = el.selectionStart ?? 0, b = el.selectionEnd ?? el.value.length;
  const from = a !== b ? a : 0;
  try {
    const out = appendLatex(el.value.slice(from, b), vars);
    el.value = el.value.slice(0, from) + out + el.value.slice(b);
    el.setSelectionRange(from + out.length, from + out.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return null;
  } catch (e) {
    if (e instanceof CalcError) return e.message;
    throw e;
  }
}
