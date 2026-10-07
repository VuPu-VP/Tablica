import { InputRule, Node, type NodeViewRendererProps } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import katex from 'katex';
import { toast } from '../ui/toast';
import { calcInMathInput, docVars } from './calc';
import { convertInMathInput } from './fraction';

/** Renderuje LaTeX do elementu. Błędna składnia nie wywala edytora, tylko pokazuje się na czerwono. */
export function renderMath(el: HTMLElement, latex: string, display: boolean) {
  try {
    katex.render(latex || '\\square', el, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' });
  } catch {
    el.textContent = latex;
  }
}

/** Po wstawieniu statycznego HTML (blok nieedytowany) zamienia znaczniki wzorów na wyrenderowany KaTeX. */
export function hydrateMath(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-math]').forEach((el) => {
    renderMath(el, el.dataset.latex ?? '', el.dataset.math === 'block');
  });
}

/**
 * Widok węzła wzoru w edytorze: normalnie pokazuje wyrenderowany wzór,
 * po kliknięciu – pole z kodem LaTeX i podglądem na żywo.
 */
function mathView(display: boolean) {
  return ({ node, editor, getPos }: NodeViewRendererProps) => {
    const dom = document.createElement(display ? 'div' : 'span');
    dom.className = display ? 'math math-block' : 'math math-inline';
    dom.contentEditable = 'false';
    let current: PMNode = node;
    let editing = false;

    const show = () => {
      editing = false;
      dom.classList.remove('editing');
      renderMath(dom, current.attrs.latex, display);
    };

    const edit = () => {
      if (editing || !editor.isEditable) return;
      editing = true;
      dom.draggable = false;
      dom.classList.add('editing');
      const input = document.createElement(display ? 'textarea' : 'input');
      input.className = 'math-input';
      input.draggable = false;
      input.value = current.attrs.latex;
      input.placeholder = 'np. \\frac{a}{b} albo x^2';
      input.spellcheck = false;
      const preview = document.createElement('span');
      preview.className = 'math-preview';
      const update = () => renderMath(preview, input.value, display);
      input.addEventListener('input', update);
      update();
      dom.replaceChildren(input, preview);

      let done = false;
      const commit = (moveAfter: boolean) => {
        if (done) return;
        done = true;
        const pos = getPos();
        if (typeof pos !== 'number') return show();
        const latex = input.value.trim();
        if (!latex) {
          editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
          return;
        }
        editor
          .chain()
          .command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { latex }); return true; })
          .run();
        show();
        if (moveAfter) editor.chain().focus().setTextSelection(pos + current.nodeSize).run();
      };
      input.addEventListener('keydown', (ev) => {
        const e = ev as KeyboardEvent;
        e.stopPropagation();
        if (e.key === 'Enter' && (!display || !e.shiftKey)) { e.preventDefault(); commit(true); }
        if (e.key === 'Escape') { e.preventDefault(); done = true; show(); editor.commands.focus(); }
        if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); convertInMathInput(input); }
        if (e.altKey && e.code === 'Equal') {
          e.preventDefault();
          const err = calcInMathInput(input, docVars(editor));
          if (err) toast(err, 'error');
        }
      });
      input.addEventListener('blur', () => commit(false));
      requestAnimationFrame(() => { input.focus(); input.select(); });
    };

    dom.addEventListener('click', (e) => { e.preventDefault(); edit(); });
    // Przeciąganie myszką/rysikiem w polu kodu ma zaznaczać tekst, a nie „chwytać” cały wzór jak obrazek.
    dom.addEventListener('dragstart', (e) => { if (editing) e.preventDefault(); });
    show();
    // Świeżo wstawiony pusty wzór (przycisk Σ) od razu otwiera się do edycji.
    if (!node.attrs.latex) requestAnimationFrame(edit);

    return {
      dom,
      update: (n: PMNode) => {
        if (n.type !== current.type) return false;
        current = n;
        if (!editing) show();
        return true;
      },
      stopEvent: () => editing,
      // ProseMirror przy zaznaczeniu węzła ustawia mu draggable=true – tu tylko podświetlamy wzór
      selectNode: () => { dom.classList.add('ProseMirror-selectednode'); },
      deselectNode: () => { dom.classList.remove('ProseMirror-selectednode'); },
      ignoreMutation: () => true,
    };
  };
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span[data-math="inline"]', getAttrs: (el) => ({ latex: (el as HTMLElement).dataset.latex ?? '' }) }];
  },
  renderHTML({ node }) {
    return ['span', { 'data-math': 'inline', 'data-latex': node.attrs.latex }];
  },
  addNodeView() {
    return mathView(false);
  },
  addInputRules() {
    return [
      // $…$ – ale nie $$…$ (to początek wzoru blokowego)
      new InputRule({
        find: /(?<!\$)\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1].trim() }));
        },
      }),
    ];
  },
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'div[data-math="block"]', getAttrs: (el) => ({ latex: (el as HTMLElement).dataset.latex ?? '' }) }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-math': 'block', 'data-latex': node.attrs.latex }];
  },
  addNodeView() {
    return mathView(true);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([^$\n]+)\$\$$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceRangeWith(range.from, range.to, this.type.create({ latex: match[1].trim() }));
        },
      }),
    ];
  },
});
