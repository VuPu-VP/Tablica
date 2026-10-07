import { Extension, type JSONContent } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { toast } from '../ui/toast';
import { calculate } from './calc';
import { convertToFraction } from './fraction';
import { MathBlock, MathInline } from './math';

/** Ctrl+/ – zaznaczony zapis z ukośnikiem (albo słowo przed kursorem) zamienia się w ułamek. */
const FractionShortcut = Extension.create({
  name: 'fractionShortcut',
  addKeyboardShortcuts() {
    return { 'Mod-/': () => convertToFraction(this.editor) };
  },
});

/** Alt+= – liczy działanie przed kursorem (albo zaznaczone) i dopisuje wynik. */
const CalcShortcut = Extension.create({
  name: 'calcShortcut',
  addKeyboardShortcuts() {
    return {
      'Alt-=': () => {
        const err = calculate(this.editor);
        if (err) toast(err, 'error');
        return true;
      },
    };
  },
});

// Wspólna lista rozszerzeń – edytor i statyczne renderowanie muszą znać te same typy węzłów.
export const baseExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: false,
    codeBlock: false,
  }),
  MathInline,
  MathBlock,
];

export const editorExtensions = [
  ...baseExtensions,
  Placeholder.configure({ placeholder: 'Pisz… ($x^2$ = wzór)' }),
  FractionShortcut,
  CalcShortcut,
];

export const emptyDoc = (): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph' }] });

/** Zwykły tekst z dokumentu – do miniatur, wyszukiwania i eksportu Markdown. */
export function plainText(doc: unknown): string[] {
  const lines: string[] = [];
  const walk = (n: JSONContent, acc: string[]): void => {
    if (n.type === 'text') acc.push(n.text ?? '');
    else if (n.type === 'mathInline') acc.push(`$${n.attrs?.latex ?? ''}$`);
    else if (n.type === 'hardBreak') acc.push('\n');
    n.content?.forEach((c) => walk(c, acc));
  };
  const top = (doc as JSONContent)?.content ?? [];
  const block = (n: JSONContent, prefix = '') => {
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      n.content?.forEach((li, i) => li.content?.forEach((c) => block(c, n.type === 'bulletList' ? '• ' : `${i + 1}. `)));
    } else if (n.type === 'mathBlock') {
      lines.push(`$$${n.attrs?.latex ?? ''}$$`);
    } else if (n.type === 'blockquote') {
      n.content?.forEach((c) => block(c, '> '));
    } else {
      const acc: string[] = [];
      walk(n, acc);
      lines.push(prefix + acc.join(''));
    }
  };
  top.forEach((n) => block(n));
  return lines;
}

export function isDocEmpty(doc: unknown): boolean {
  return plainText(doc).every((l) => !l.trim());
}
