import { useLiveQuery } from 'dexie-react-hooks';
import { createNotebook, createSubject, deleteNotebook, deleteSubject, listNotebooks, listSubjects, renameNotebook, updateSubject } from '../db/repo';
import type { ID, Subject } from '../db/types';
import { Icon } from '../ui/Icon';
import { useMenu } from '../ui/Menu';
import type { ThemePref } from '../app/theme';

export const SUBJECT_COLORS = ['#3B5BDB', '#D9732A', '#1E8A4C', '#8E44AD', '#D9342B', '#0E8A9A', '#B8860B'];

interface Props {
  notebookId: ID | null;
  onOpen: (notebookId: ID) => void;
  theme: ThemePref;
  onTheme: () => void;
  onSettings: () => void;
}

function SubjectGroup({ subject, notebookId, onOpen }: { subject: Subject; notebookId: ID | null; onOpen: (id: ID) => void }) {
  const notebooks = useLiveQuery(() => listNotebooks(subject.id), [subject.id]);
  const menu = useMenu();

  const addNotebook = async () => {
    const name = prompt(`Nowy zeszyt w „${subject.name}”:`, notebooks?.length ? '' : 'Wykłady');
    if (name?.trim()) onOpen((await createNotebook(subject.id, name.trim())).id);
  };

  return (
    <>
      <div className="subject-row" onContextMenu={(e) => subjectMenu(e)}>
        <span className="dot" style={{ background: subject.color }} />
        <span className="name">{subject.name}</span>
        <span className="row-actions">
          <button className="icon-btn sm" title="Nowy zeszyt" onClick={addNotebook}><Icon name="plus" size={16} /></button>
          <button className="icon-btn sm" title="Opcje przedmiotu" onClick={(e) => subjectMenu(e)}><Icon name="more" size={16} /></button>
        </span>
      </div>
      {notebooks?.map((nb) => (
        <div key={nb.id} className={`nb-item ${nb.id === notebookId ? 'selected' : ''}`} role="button" tabIndex={0}
          onClick={() => onOpen(nb.id)}
          onKeyDown={(e) => { if (e.key === 'Enter') onOpen(nb.id); }}
          onContextMenu={(e) => nbMenu(e, nb.id, nb.name)}
        >
          <Icon name="notebook" size={18} />
          <span className="name">{nb.name}</span>
          <span className="row-actions">
            <button className="icon-btn sm" title="Opcje zeszytu" onClick={(e) => { e.stopPropagation(); nbMenu(e, nb.id, nb.name); }}><Icon name="more" size={16} /></button>
          </span>
        </div>
      ))}
      {menu.element}
    </>
  );

  function subjectMenu(e: React.MouseEvent) {
    menu.open(e, [
      { label: 'Nowy zeszyt', icon: 'plus', onClick: addNotebook },
      { label: 'Zmień nazwę', onClick: () => { const n = prompt('Nazwa przedmiotu:', subject.name); if (n?.trim()) updateSubject(subject.id, { name: n.trim() }); } },
      { label: 'Zmień kolor', onClick: () => updateSubject(subject.id, { color: SUBJECT_COLORS[(SUBJECT_COLORS.indexOf(subject.color) + 1) % SUBJECT_COLORS.length] }) },
      'separator',
      { label: 'Usuń przedmiot', icon: 'trash', danger: true, onClick: () => { if (confirm(`Usunąć „${subject.name}” razem ze wszystkimi zeszytami?`)) deleteSubject(subject.id); } },
    ]);
  }

  function nbMenu(e: React.MouseEvent, id: ID, name: string) {
    menu.open(e, [
      { label: 'Zmień nazwę', onClick: () => { const n = prompt('Nazwa zeszytu:', name); if (n?.trim()) renameNotebook(id, n.trim()); } },
      'separator',
      { label: 'Usuń zeszyt', icon: 'trash', danger: true, onClick: () => { if (confirm(`Usunąć zeszyt „${name}”?`)) deleteNotebook(id); } },
    ]);
  }
}

export function Sidebar({ notebookId, onOpen, theme, onTheme, onSettings }: Props) {
  const subjects = useLiveQuery(listSubjects, []);

  const addSubject = async () => {
    const name = prompt('Nazwa przedmiotu (np. Analiza matematyczna):');
    if (!name?.trim()) return;
    const color = SUBJECT_COLORS[(subjects?.length ?? 0) % SUBJECT_COLORS.length];
    const s = await createSubject(name.trim(), color);
    onOpen((await createNotebook(s.id, 'Wykłady')).id);
  };

  return (
    <aside className="sidebar" aria-label="Przedmioty i zeszyty">
      <div className="side-head">
        <span className="label-caps">Przedmioty</span>
        <button className="icon-btn sm" title="Nowy przedmiot" onClick={addSubject}><Icon name="plus" size={18} /></button>
      </div>
      {subjects?.length === 0 && (
        <div className="empty" style={{ placeItems: 'start', textAlign: 'left', padding: '12px 8px' }}>
          <div>
            <p style={{ margin: '0 0 12px' }}>Nie masz jeszcze żadnych przedmiotów.</p>
            <button className="btn" onClick={addSubject}><Icon name="plus" size={18} /> Dodaj przedmiot</button>
          </div>
        </div>
      )}
      {subjects?.map((s) => <SubjectGroup key={s.id} subject={s} notebookId={notebookId} onOpen={onOpen} />)}
      <div className="side-foot">
        <button className="nb-item" onClick={onSettings}>
          <Icon name="settings" size={18} />
          <span className="name">Ustawienia i synchronizacja</span>
        </button>
        <button className="nb-item" onClick={onTheme}>
          <Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'settings'} size={18} />
          <span className="name">Motyw: {theme === 'system' ? 'systemowy' : theme === 'dark' ? 'ciemny' : 'jasny'}</span>
        </button>
      </div>
    </aside>
  );
}
