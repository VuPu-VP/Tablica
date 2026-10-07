import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { ID } from '../db/types';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';

/** Wybór zeszytu docelowego (przenoszenie / kopiowanie stron). */
export function NotebookPicker({ title, currentId, onPick, onClose }: { title: string; currentId?: ID; onPick: (id: ID) => void; onClose: () => void }) {
  const tree = useLiveQuery(async () => {
    const subjects = (await db.subjects.toArray()).filter((s) => !s.deleted).sort((a, b) => (a.order < b.order ? -1 : 1));
    const notebooks = (await db.notebooks.toArray()).filter((n) => !n.deleted).sort((a, b) => (a.order < b.order ? -1 : 1));
    return subjects.map((s) => ({ s, nbs: notebooks.filter((n) => n.subjectId === s.id) }));
  }, []);
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="picker">
        {tree?.map(({ s, nbs }) => (
          <div key={s.id}>
            <div className="subject-row"><span className="dot" style={{ background: s.color }} /><span className="name">{s.name}</span></div>
            {nbs.map((nb) => (
              <button key={nb.id} className={`nb-item ${nb.id === currentId ? 'selected' : ''}`} onClick={() => { onPick(nb.id); onClose(); }}>
                <Icon name="notebook" size={18} />
                <span className="name">{nb.name}{nb.id === currentId ? ' (ten zeszyt)' : ''}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
