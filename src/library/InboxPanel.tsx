import { memo } from 'react';
import type { ImageObj } from '../db/types';
import { diagramEditing } from '../diagrams/editing';
import { useBlobUrl } from '../import/blobs';
import { imageEditing } from '../import/ImageEditor';
import { removeFromInbox, useInbox } from '../import/inbox';
import { Icon } from '../ui/Icon';

function ago(z: number): string {
  const s = Math.max(0, Math.round((Date.now() - z / 1000) / 1000));
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return `${Math.floor(s / 3600)} godz. temu`;
  return new Date(z / 1000).toLocaleDateString('pl-PL');
}

const InboxItem = memo(function InboxItem({ item, onPick }: { item: ImageObj; onPick: () => void }) {
  const url = useBlobUrl(item.blobId);
  return (
    <div className="inbox-item">
      {url ? <img src={url} alt="" draggable={false} onClick={onPick} /> : <div className="inbox-missing">pobieranie…</div>}
      <div className="inbox-meta">
        <span className="muted small" style={{ margin: 0 }}>{ago(item.z)}</span>
        <span className="spacer" />
        <button className="icon-btn sm" title="Edytuj (przytnij, obróć, filtr)" disabled={!url} onClick={() => imageEditing.open(item)}><Icon name="crop" size={16} /></button>
        <button className="icon-btn sm" title="Usuń ze skrzynki" onClick={() => removeFromInbox(item)}><Icon name="trash" size={16} /></button>
        <button className="btn sm" disabled={!url} onClick={onPick}>Wstaw</button>
      </div>
    </div>
  );
});

/** Panel skrzynki na laptopie: zdjęcia z telefonu czekające na wstawienie. */
export function InboxPanel({ onClose }: { onClose: () => void }) {
  const items = useInbox();
  return (
    <aside className="inbox" aria-label="Skrzynka zdjęć z telefonu">
      <header>
        <Icon name="inbox" size={18} />
        <strong>Skrzynka zdjęć</strong>
        <span className="spacer" />
        <button className="icon-btn sm" onClick={onClose} aria-label="Zamknij"><Icon name="x" size={16} /></button>
      </header>
      {items.length === 0 ? (
        <p className="muted small">
          Pusto. Na telefonie stuknij ikonę aparatu w górnym pasku – zdjęcia pojawią się tutaj po kilkunastu sekundach
          (wymaga włączonej synchronizacji z Google Drive na obu urządzeniach).
        </p>
      ) : (
        <div className="inbox-list">
          {items.map((it) => (
            <InboxItem key={it.id} item={it} onPick={() => diagramEditing.startPlacing(it, true)} />
          ))}
        </div>
      )}
    </aside>
  );
}
