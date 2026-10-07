import type { JSONContent } from '@tiptap/core';
import type { PageObject, TextObj } from '../db/types';

// Zamiana notatek na Markdown – do wklejenia w claude.ai (fiszki, streszczenia, quizy).
// Wzory zostają jako $…$ i $$…$$, więc Claude czyta je jako LaTeX.

function inline(nodes: JSONContent[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'mathInline') return `$${n.attrs?.latex ?? ''}$`;
      if (n.type === 'hardBreak') return '  \n';
      if (n.type !== 'text') return inline(n.content);
      let t = n.text ?? '';
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') t = `**${t}**`;
        else if (m.type === 'italic') t = `*${t}*`;
        else if (m.type === 'strike') t = `~~${t}~~`;
        else if (m.type === 'code') t = `\`${t}\``;
      }
      return t;
    })
    .join('');
}

function block(n: JSONContent, indent = ''): string[] {
  switch (n.type) {
    case 'heading':
      return [`${'#'.repeat(Math.min(6, (n.attrs?.level ?? 1) + 1))} ${inline(n.content)}`];
    case 'paragraph':
      return [indent + inline(n.content)];
    case 'bulletList':
    case 'orderedList':
      return (n.content ?? []).flatMap((li, i) => {
        const marker = n.type === 'bulletList' ? '- ' : `${i + 1}. `;
        const inner = (li.content ?? []).flatMap((c) => block(c, indent + '   '));
        if (!inner.length) return [indent + marker];
        return [indent + marker + inner[0].trimStart(), ...inner.slice(1)];
      });
    case 'blockquote':
      return (n.content ?? []).flatMap((c) => block(c)).map((l) => `> ${l}`);
    case 'mathBlock':
      return ['$$', n.attrs?.latex ?? '', '$$'];
    case 'horizontalRule':
      return ['---'];
    default:
      return n.content ? n.content.flatMap((c) => block(c, indent)) : [];
  }
}

export function docToMarkdown(doc: unknown): string {
  const top = (doc as JSONContent)?.content ?? [];
  return top.map((n) => block(n).join('\n')).filter((s) => s.trim()).join('\n\n');
}

/** Tekst strony w kolejności czytania (z góry na dół, potem od lewej). */
export function pageToMarkdown(objects: PageObject[]): { markdown: string; hasInk: boolean } {
  const texts = objects
    .filter((o): o is TextObj => o.type === 'text')
    .sort((a, b) => (Math.abs(a.y - b.y) < 2.5 ? a.x - b.x : a.y - b.y));
  const hasInk = objects.some((o) => o.type !== 'text');
  return { markdown: texts.map((t) => docToMarkdown(t.doc)).filter(Boolean).join('\n\n'), hasInk };
}
