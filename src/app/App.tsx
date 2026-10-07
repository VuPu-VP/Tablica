import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { db } from '../db/db';
import type { ID, Page } from '../db/types';
import { Editor } from '../editor/Editor';
import { copyPageAsImage, copyPageMarkdown, copyText, notebookMarkdown } from '../export/share';
import { SearchDialog } from '../library/SearchDialog';
import { ExportDialog } from '../export/ExportDialog';
import { PrintView, type PrintJob } from '../export/PrintView';
import { SettingsDialog, SyncPill } from '../sync/SyncUI';
import { Sidebar } from '../library/Sidebar';
import { Thumbnails } from '../pages/Thumbnails';
import { Icon } from '../ui/Icon';
import { useMenu } from '../ui/Menu';
import { Toasts } from '../ui/toast';
import { useTheme } from './theme';

const NAV_KEY = 'tablica.nav';

function useIsMobile() {
  return useSyncExternalStore(
    (f) => { const m = matchMedia('(max-width: 767px)'); m.addEventListener('change', f); return () => m.removeEventListener('change', f); },
    () => matchMedia('(max-width: 767px)').matches,
  );
}


export function App() {
  const [notebookId, setNotebookId] = useState<ID | null>(() => {
    try { return localStorage.getItem(NAV_KEY); } catch { return null; }
  });
  // Na telefonie startujemy w ostatnio otwartym zeszycie, na komputerze z widocznym panelem.
  const [sidebarOpen, setSidebarOpen] = useState(() => !matchMedia('(max-width: 767px)').matches);
  const [thumbsOpen, setThumbsOpen] = useState(true);
  const [current, setCurrent] = useState<{ page?: Page; index: number; total: number }>({ index: 0, total: 0 });
  const [jump, setJump] = useState<{ pageId: ID; nonce: number } | null>(null);
  const [theme, cycleTheme] = useTheme();
  const mobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const endPrint = useCallback(() => setPrintJob(null), []);
  const menu = useMenu();

  const notebook = useLiveQuery(async () => (notebookId ? db.notebooks.get(notebookId) : undefined), [notebookId]);
  const subject = useLiveQuery(async () => (notebook ? db.subjects.get(notebook.subjectId) : undefined), [notebook?.subjectId]);
  const validNotebook = notebook && !notebook.deleted ? notebook : undefined;

  useEffect(() => {
    try {
      if (notebookId) localStorage.setItem(NAV_KEY, notebookId);
      else localStorage.removeItem(NAV_KEY);
    } catch { /* ignorujemy */ }
  }, [notebookId]);

  const open = useCallback((id: ID) => { setNotebookId(id); if (mobile) setSidebarOpen(false); }, [mobile]);
  const onCurrentPage = useCallback((page: Page | undefined, index: number, total: number) => setCurrent({ page, index, total }), []);
  const onJump = useCallback((pageId: ID) => setJump({ pageId, nonce: Math.random() }), []);
  const openAt = useCallback((id: ID, pageId?: ID) => { open(id); if (pageId) onJump(pageId); }, [open, onJump]);

  // Ctrl+F / Ctrl+K – wyszukiwarka
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'k')) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const claudeMenu = (e: React.MouseEvent) => {
    const pageId = current.page?.id;
    const nbId = validNotebook?.id;
    menu.open(e, [
      ...(pageId ? [
        { label: 'Kopiuj stronę jako obraz', icon: 'image' as const, onClick: () => copyPageAsImage(pageId) },
        { label: 'Kopiuj tekst strony (Markdown)', icon: 'text' as const, onClick: () => copyPageMarkdown(pageId) },
      ] : []),
      ...(nbId ? [{ label: 'Kopiuj cały zeszyt (Markdown)', icon: 'notebook' as const, onClick: async () => copyText(await notebookMarkdown(nbId), 'cały zeszyt') }] : []),
      'separator' as const,
      { label: 'Otwórz claude.ai', icon: 'chevron' as const, onClick: () => window.open('https://claude.ai/new', '_blank', 'noopener') },
    ]);
  };

  // Na telefonie: albo lista przedmiotów, albo otwarty zeszyt.
  const showSidebar = mobile ? !validNotebook || sidebarOpen : sidebarOpen;
  const showEditor = !!validNotebook && !(mobile && showSidebar);

  return (
    <div className="app">
      <header className="topbar">
        {mobile && showEditor ? (
          <button className="icon-btn" title="Zeszyty" onClick={() => setSidebarOpen(true)}><Icon name="back" /></button>
        ) : (
          <button className="icon-btn hide-mobile" title="Panel przedmiotów" onClick={() => setSidebarOpen((v) => !v)}><Icon name="sidebar" /></button>
        )}
        {validNotebook && showEditor && (
          <button className="icon-btn hide-mobile" title="Panel stron" onClick={() => setThumbsOpen((v) => !v)}><Icon name="pages" /></button>
        )}
        <div className="crumbs">
          {showEditor && validNotebook ? (
            <>
              <span className="hide-mobile">{subject?.name}</span>
              <span className="hide-mobile">›</span>
              <span>{validNotebook.name}</span>
              <span>›</span>
              <strong>Strona {current.index + 1} z {current.total}</strong>
            </>
          ) : (
            <strong>Tablica</strong>
          )}
        </div>
        <div className="spacer" />
        <button className="icon-btn" title="Szukaj (Ctrl+F)" onClick={() => setSearchOpen(true)}><Icon name="search" /></button>
        {showEditor && (
          <button className="icon-btn" title="Kopiuj dla Claude (fiszki, quiz, streszczenie w claude.ai)" onClick={claudeMenu}><Icon name="copy" /></button>
        )}
        {showEditor && (
          <button className="icon-btn" title="Eksport do PDF / drukuj" onClick={() => setExportOpen(true)}><Icon name="export" /></button>
        )}
        <SyncPill onOpenSettings={() => setSettingsOpen(true)} />
      </header>
      <div className="body">
        {showSidebar && <Sidebar notebookId={validNotebook?.id ?? null} onOpen={open} theme={theme} onTheme={cycleTheme} onSettings={() => setSettingsOpen(true)} />}
        {showEditor && validNotebook && (
          <>
            {thumbsOpen && !mobile && <Thumbnails notebookId={validNotebook.id} currentPageId={current.page?.id} onJump={onJump} />}
            <Editor key={validNotebook.id} notebookId={validNotebook.id} jump={jump} onCurrentPage={onCurrentPage} />
          </>
        )}
        {!validNotebook && !mobile && (
          <div className="empty">
            <div>
              <Icon name="notebook" size={40} />
              <h2>Wybierz albo utwórz zeszyt</h2>
              <p>Przedmioty i zeszyty znajdziesz w panelu po lewej.</p>
            </div>
          </div>
        )}
      </div>
      {menu.element}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} onOpen={openAt} />}
      {exportOpen && validNotebook && (
        <ExportDialog
          notebookId={validNotebook.id}
          title={`${subject?.name ?? ''} – ${validNotebook.name}`}
          currentIndex={current.index}
          total={current.total}
          onClose={() => setExportOpen(false)}
          onPrint={setPrintJob}
        />
      )}
      {printJob && <PrintView job={printJob} onDone={endPrint} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <Toasts />
    </div>
  );
}
