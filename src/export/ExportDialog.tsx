import { useState } from 'react';
import { listPages } from '../db/repo';
import type { ID } from '../db/types';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/toast';
import type { PrintJob } from './PrintView';
import { parseRange } from './range';

interface Props {
  notebookId: ID;
  title: string;
  currentIndex: number;
  total: number;
  onClose: () => void;
  onPrint: (job: PrintJob) => void;
}

export function ExportDialog({ notebookId, title, currentIndex, total, onClose, onPrint }: Props) {
  const [scope, setScope] = useState<'all' | 'current' | 'range'>('all');
  const [range, setRange] = useState(`1-${total}`);
  const [withBackground, setWithBackground] = useState(true);

  const go = async () => {
    const pages = await listPages(notebookId);
    const idx = scope === 'all' ? pages.map((_, i) => i) : scope === 'current' ? [currentIndex] : parseRange(range, pages.length);
    const chosen = idx.map((i) => pages[i]).filter(Boolean);
    if (!chosen.length) { toast('Nie wybrano żadnej strony', 'error'); return; }
    onPrint({ pages: chosen, withBackground, title: scope === 'current' ? `${title} – strona ${currentIndex + 1}` : title });
    onClose();
  };

  return (
    <Dialog title="Eksport do PDF / drukowanie" onClose={onClose}>
      <div className="form">
        <fieldset>
          <legend>Strony</legend>
          <label><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /> Cały zeszyt ({total})</label>
          <label><input type="radio" checked={scope === 'current'} onChange={() => setScope('current')} /> Bieżąca strona ({currentIndex + 1})</label>
          <label>
            <input type="radio" checked={scope === 'range'} onChange={() => setScope('range')} /> Zakres:
            <input className="text-input" value={range} onFocus={() => setScope('range')} onChange={(e) => setRange(e.target.value)} placeholder="np. 1-3, 5" />
          </label>
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={withBackground} onChange={(e) => setWithBackground(e.target.checked)} />
          Drukuj tło (kratka / kropki)
        </label>
        <p className="muted small">
          W oknie drukowania wybierz <b>„Microsoft Print to PDF”</b> (Windows) albo <b>„Zapisz jako PDF”</b>,
          rozmiar A4, marginesy: <b>brak</b>, skala: <b>100%</b>. Na iPhonie: Udostępnij → Drukuj → rozsuń podgląd dwoma palcami, aby zapisać PDF.
        </p>
        <button className="btn" onClick={go}><Icon name="export" size={18} /> Zapisz PDF / drukuj</button>
      </div>
    </Dialog>
  );
}
