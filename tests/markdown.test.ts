import { describe, expect, it } from 'vitest';
import type { TextObj } from '../src/db/types';
import { docToMarkdown, pageToMarkdown } from '../src/text/markdown';

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Całka oznaczona' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Wzór ' },
        { type: 'text', text: 'ważny', marks: [{ type: 'bold' }] },
        { type: 'text', text: ': ' },
        { type: 'mathInline', attrs: { latex: '\\int_a^b f' } },
      ],
    },
    { type: 'mathBlock', attrs: { latex: 'F(b)-F(a)' } },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'pierwszy' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'drugi' }] }] },
      ],
    },
  ],
};

describe('eksport do Markdown', () => {
  it('nagłówki, pogrubienie, wzory i listy', () => {
    expect(docToMarkdown(doc)).toBe(
      ['## Całka oznaczona', 'Wzór **ważny**: $\\int_a^b f$', '$$\nF(b)-F(a)\n$$', '- pierwszy\n- drugi'].join('\n\n'),
    );
  });

  it('bloki tekstu w kolejności czytania i informacja o piśmie odręcznym', () => {
    const t = (id: string, x: number, y: number, text: string): TextObj => ({
      id, pageId: 'p', type: 'text', x, y, w: 50, z: 0, updatedAt: 0, deleted: 0, dirty: 0,
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    });
    const { markdown, hasInk } = pageToMarkdown([t('b', 10, 50, 'dół'), t('a', 10, 10, 'góra'), t('c', 100, 11, 'obok')]);
    expect(markdown).toBe('góra\n\nobok\n\ndół');
    expect(hasInk).toBe(false);
  });
});
