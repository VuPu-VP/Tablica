import { db } from '../db/db';
import { listObjects, listPages } from '../db/repo';
import type { ID } from '../db/types';
import { pageToMarkdown } from '../text/markdown';
import { toast } from '../ui/toast';

// „Most do Claude”: kopiujemy stronę jako obraz albo tekst (Markdown) do schowka,
// a Ty wklejasz to w claude.ai i prosisz o fiszki, quiz albo streszczenie – w ramach planu Max.

/** Element DOM strony (musi być wyrenderowana, czyli widoczna w edytorze). */
const pageElement = (pageId: ID) => document.querySelector<HTMLElement>(`[data-page-id="${pageId}"] .page`);

// Osadzanie czcionek (Inter + KaTeX) jest najwolniejszym krokiem – liczymy je raz na sesję.
let fontCSS: Promise<string> | null = null;

export async function pageToPng(pageId: ID): Promise<Blob> {
  const el = pageElement(pageId);
  if (!el) throw new Error('Strona nie jest wyświetlona');
  const { toBlob, getFontEmbedCSS } = await import('html-to-image');
  fontCSS ??= getFontEmbedCSS(document.body).catch(() => '');
  const blob = await toBlob(el, {
    fontEmbedCSS: await fontCSS,
    pixelRatio: Math.max(2, 1600 / el.offsetWidth), // ~1600 px szerokości – czytelne dla Claude'a
    backgroundColor: '#ffffff',
    filter: (n) => !(n instanceof HTMLElement && n.matches('.selection, .sel-menu, .tb-grip, .tb-resize')),
    style: { boxShadow: 'none', borderRadius: '0' },
  });
  if (!blob) throw new Error('Nie udało się utworzyć obrazu');
  return blob;
}

export async function copyPageAsImage(pageId: ID) {
  try {
    // Przekazujemy obietnicę (Promise) – Safari wymaga, żeby zapis do schowka zaczął się od razu po kliknięciu.
    const blob = pageToPng(pageId);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Skopiowano stronę jako obraz – wklej w claude.ai (Ctrl+V)');
  } catch {
    // Zapasowo: udostępnij/pobierz plik PNG.
    try {
      const blob = await pageToPng(pageId);
      const file = new File([blob], 'strona.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else downloadBlob(blob, 'strona.png');
      toast('Zapisano obraz strony');
    } catch (e) {
      toast('Nie udało się skopiować strony: ' + (e as Error).message, 'error');
    }
  }
}

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Skopiowano ${what} – wklej w claude.ai`);
  } catch {
    toast('Przeglądarka nie pozwoliła skopiować tekstu', 'error');
  }
}

export async function copyPageMarkdown(pageId: ID) {
  const { markdown, hasInk } = pageToMarkdown(await listObjects(pageId));
  if (!markdown.trim()) {
    toast(hasInk ? 'Na tej stronie jest tylko pismo odręczne – użyj „Kopiuj jako obraz”' : 'Strona jest pusta', 'error');
    return;
  }
  await copyText(markdown + (hasInk ? '\n\n> (Na stronie są też notatki odręczne – nie ma ich w tekście.)' : ''), 'tekst strony');
}

export async function notebookMarkdown(notebookId: ID): Promise<string> {
  const nb = await db.notebooks.get(notebookId);
  const subject = nb ? await db.subjects.get(nb.subjectId) : undefined;
  const pages = await listPages(notebookId);
  const parts = [`# ${subject?.name ?? ''} – ${nb?.name ?? ''}`];
  for (const [i, p] of pages.entries()) {
    const { markdown, hasInk } = pageToMarkdown(await listObjects(p.id));
    if (!markdown && !hasInk) continue;
    parts.push(`## Strona ${i + 1}`, markdown || '_(tylko pismo odręczne)_');
  }
  return parts.join('\n\n');
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
