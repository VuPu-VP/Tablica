import { useEffect, useState } from 'react';
import type { ID } from '../db/types';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { searchAll, type SearchResult } from './search';

export function SearchDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (notebookId: ID, pageId?: ID) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await searchAll(q);
      if (!cancelled) setResults(q.trim().length >= 2 ? r : null);
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const pick = (r: SearchResult) => { onOpen(r.notebook.id, r.pageId); onClose(); };

  return (
    <Dialog title="Szukaj w notatkach" onClose={onClose} wide>
      <label className="search-field">
        <Icon name="search" size={18} />
        <input
          autoFocus
          value={q}
          placeholder="Szukaj w tekście, nazwach zeszytów i przedmiotów…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results?.[0]) pick(results[0]); }}
        />
      </label>
      <p className="muted small">Pismo odręczne nie jest przeszukiwane – tylko tekst z klawiatury i wzory.</p>
      <div className="results">
        {results?.length === 0 && <p className="muted">Nic nie znaleziono.</p>}
        {results?.map((r, i) => (
          <button key={i} className="result" onClick={() => pick(r)}>
            <span className="dot" style={{ background: r.subject.color }} />
            <span className="result-main">
              <span className="result-path">
                {r.subject.name} › {r.notebook.name}{r.kind === 'text' ? ` › strona ${r.pageIndex! + 1}` : ''}
              </span>
              {r.snippet && <span className="result-snippet">{r.snippet}</span>}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
