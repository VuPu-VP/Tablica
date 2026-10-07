import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';

// Zamiana zapisu z ukośnikiem na ułamek LaTeX: „(a+b)/(c-d)” → \frac{a+b}{c-d}.

const OPEN = '([{';
const CLOSE = ')]}';

/** Pozycje znaków spełniających warunek, ale tylko poza nawiasami (głębokość 0). */
function topLevel(s: string, test: (ch: string) => boolean): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && test(ch)) out.push(i);
  }
  return out;
}

/** Zdejmuje jedną parę nawiasów, jeśli obejmuje całe wyrażenie: „(a+b)” → „a+b”, ale „(a)(b)” bez zmian. */
export function stripOuterParens(s: string): string {
  const t = s.trim();
  if (t.length < 2 || t[0] !== '(' || t[t.length - 1] !== ')') return t;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (OPEN.includes(t[i])) depth++;
    else if (CLOSE.includes(t[i])) depth--;
    if (depth === 0 && i < t.length - 1) return t; // nawias zamyka się wcześniej
  }
  return t.slice(1, -1).trim();
}

/**
 * „a/b” → „\frac{a}{b}”. Dzielimy przy OSTATNIM ukośniku poza nawiasami, więc a/b/c = (a/b)/c,
 * a ukośniki w nawiasach zamieniamy rekurencyjnie. Zwraca null, gdy nie ma czego zamieniać.
 */
export function slashToFrac(expr: string): string | null {
  const s = expr.trim();
  const slashes = topLevel(s, (ch) => ch === '/');
  if (!slashes.length) {
    // ukośnik tylko wewnątrz nawiasów, np. „(1/2)” → spróbuj po zdjęciu nawiasów
    const inner = stripOuterParens(s);
    return inner !== s ? slashToFrac(inner) : null;
  }
  const i = slashes[slashes.length - 1];
  const side = (part: string) => {
    const p = stripOuterParens(part);
    return slashToFrac(p) ?? p;
  };
  const num = side(s.slice(0, i));
  const den = side(s.slice(i + 1));
  if (!num || !den) return null;
  return `\\frac{${num}}{${den}}`;
}

/** Znaki oddzielające człony (poza nawiasami): spacje i operatory o niższym priorytecie niż dzielenie. */
const SEP = /[\s=+\-<>,;≈≤≥±−]/;

/** Dzieli wyrażenie na człony i separatory (tylko poza nawiasami): „I=U/R” → [„I”, „=”, „U/R”]. */
function splitTerms(text: string): string[] {
  const cuts = topLevel(text, (ch) => SEP.test(ch));
  const out: string[] = [];
  let last = 0;
  for (const i of cuts) { out.push(text.slice(last, i), text[i]); last = i + 1; }
  out.push(text.slice(last));
  return out.filter(Boolean);
}

const isSep = (p: string) => p.length === 1 && SEP.test(p);

/**
 * Zamienia ułamki w kodzie LaTeX, zachowując kolejność działań:
 * „V=L dI/dt” → „V=L \frac{dI}{dt}”, „I=U/R” → „I=\frac{U}{R}”. Null, gdy nic się nie zmieniło.
 */
export function convertExpr(s: string): string | null {
  let changed = false;
  const out = splitTerms(s).map((p) => {
    if (isSep(p) || !p.includes('/')) return p;
    const f = slashToFrac(p);
    if (f) changed = true;
    return f ?? p;
  });
  return changed ? out.join('') : null;
}

/**
 * Zwykły tekst z ukośnikami → tekst + wzory. Zamienia tylko człony z ukośnikiem:
 * „a + b/c” → tekst „a + ” i wzór \frac{b}{c} (kolejność działań zostaje zachowana).
 */
export function fractionize(text: string): JSONContent[] {
  const out: JSONContent[] = [];
  let buf = '';
  const flush = () => { if (buf) out.push({ type: 'text', text: buf }); buf = ''; };
  for (const p of splitTerms(text)) {
    const frac = !isSep(p) && p.includes('/') ? slashToFrac(p) : null;
    if (frac) { flush(); out.push({ type: 'mathInline', attrs: { latex: frac } }); }
    else if (!isSep(p) && p.includes('\\')) { flush(); out.push({ type: 'mathInline', attrs: { latex: p } }); } // był wzorem – zostaje wzorem
    else buf += p;
  }
  flush();
  return out;
}

/**
 * Pole kodu wzoru (po kliknięciu wzoru): zamienia zaznaczony fragment, a bez zaznaczenia – cały kod.
 * Po zmianie wysyła zdarzenie „input”, żeby odświeżył się podgląd.
 */
export function convertInMathInput(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  const a = el.selectionStart ?? 0, b = el.selectionEnd ?? 0;
  const [from, to] = a !== b ? [a, b] : [0, el.value.length];
  const conv = convertExpr(el.value.slice(from, to));
  if (!conv) return false;
  el.value = el.value.slice(0, from) + conv + el.value.slice(to);
  el.setSelectionRange(from + conv.length, from + conv.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

const leafText = (n: PMNode) => (n.type.name === 'mathInline' ? n.attrs.latex : '');

/** Komenda dla edytora: zaznaczenie (albo słowo przed kursorem) z „/” → ułamek. Zwraca false, gdy nie było czego zamienić. */
export function convertToFraction(editor: Editor): boolean {
  const { state } = editor;
  const sel = state.selection;

  // zaznaczony (kliknięty) wzór: przerabiamy jego kod
  if (sel instanceof NodeSelection && (sel.node.type.name === 'mathInline' || sel.node.type.name === 'mathBlock')) {
    const latex = slashToFrac(sel.node.attrs.latex);
    if (!latex) return false;
    return editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(sel.from, undefined, { latex }); return true; }).run();
  }

  let from = sel.from;
  const to = sel.to;
  if (sel.empty) {
    // „słowo” tuż przed kursorem (do spacji albo początku akapitu)
    const start = sel.$from.start();
    while (from > start && !/\s/.test(state.doc.textBetween(from - 1, from, ' ', leafText))) from--;
  }
  const text = state.doc.textBetween(from, to, ' ', leafText);
  if (!text.includes('/')) return false;
  const content = fractionize(text);
  if (!content.some((c) => c.type === 'mathInline')) return false;
  return editor.chain().focus().insertContentAt({ from, to }, content).run();
}
