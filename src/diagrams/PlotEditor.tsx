import { useEffect, useState } from 'react';
import type { PlotObj, PlotSeries } from '../db/types';
import { PEN_COLORS } from '../editor/tools';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { applyQuadrants, fitToData, formatPoints, parsePoints, quadrantsOf, type Quadrants } from './plot';
import { PLOT_MARGIN, PlotSvg } from './PlotSvg';

/** Pole liczbowe przyjmujące „-”, „1,5” w trakcie pisania; zatwierdza tylko poprawne liczby. */
function Num({ value, onChange, min, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  useEffect(() => { setText((t) => (Number(t.replace(',', '.')) === value ? t : String(value).replace('.', ','))); }, [value]);
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        className="text-input"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() !== '' && Number.isFinite(v) && (min === undefined || v >= min)) onChange(v);
        }}
      />
    </label>
  );
}

const QUADRANTS: { q: Quadrants; label: string; hint: string }[] = [
  { q: 'I', label: 'I', hint: 'Tylko dodatnie x i y – typowe dla pomiarów' },
  { q: 'I+II', label: 'I + II', hint: 'y ≥ 0, x dowolne – np. parabola, |x|' },
  { q: 'I+IV', label: 'I + IV', hint: 'x ≥ 0, y dowolne – np. przebieg w czasie' },
  { q: 'all', label: 'I – IV', hint: 'Wszystkie ćwiartki' },
];

/** Miniatura: osie i zaznaczone ćwiartki. */
function QuadIcon({ q }: { q: Quadrants }) {
  const left = q === 'I+II' || q === 'all', down = q === 'I+IV' || q === 'all';
  const x0 = left ? 18 : 6, y0 = down ? 18 : 30;
  return (
    <svg viewBox="0 0 36 36" width={36} height={36} aria-hidden="true">
      <rect x={left ? 4 : x0} y={4} width={left ? 28 : 26} height={down ? 28 : y0 - 4} fill="currentColor" opacity={0.15} />
      <path d={`M${left ? 3 : x0} ${y0}H33M${x0} ${down ? 33 : y0}V3`} stroke="currentColor" strokeWidth={1.6} fill="none" />
    </svg>
  );
}

export function PlotEditor({ initial, isNew, onSave, onClose }: { initial: PlotObj; isNew: boolean; onSave: (p: PlotObj) => void; onClose: () => void }) {
  const [p, setP] = useState<PlotObj>(initial);
  const [texts, setTexts] = useState(() => initial.series.map((s) => formatPoints(s.points)));
  const upd = (patch: Partial<PlotObj>) => setP((prev) => ({ ...prev, ...patch }));
  const updSeries = (i: number, patch: Partial<PlotSeries>) => upd({ series: p.series.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const valid = p.xMax > p.xMin && p.yMax > p.yMin && p.xStep > 0 && p.yStep > 0
    && (p.xMax - p.xMin) / p.xStep <= 200 && (p.yMax - p.yMin) / p.yStep <= 200 && p.w >= 30 && p.h >= 30;

  // „1 jednostka = 1 cm”: dobiera rozmiar tak, żeby podziałka trafiała w kratkę kartki
  const unitCm = () => upd({ w: Math.min(200, (p.xMax - p.xMin) * 10 + 2 * PLOT_MARGIN), h: Math.min(260, (p.yMax - p.yMin) * 10 + 2 * PLOT_MARGIN) });

  return (
    <Dialog title={isNew ? 'Nowy układ współrzędnych' : 'Edycja wykresu'} onClose={onClose} wide>
      <div className="diagram-editor">
        <div className="form">
          <fieldset>
            <legend>Ćwiartki</legend>
            <div className="row">
              {QUADRANTS.map(({ q, label, hint }) => (
                <button key={q} className={`pal-btn ${quadrantsOf(p) === q ? 'on' : ''}`} title={hint} onClick={() => upd(applyQuadrants(p, q))}>
                  <QuadIcon q={q} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Oś X</legend>
            <div className="num-row">
              <Num label="od" value={p.xMin} onChange={(v) => upd({ xMin: v })} />
              <Num label="do" value={p.xMax} onChange={(v) => upd({ xMax: v })} />
              <Num label="co" value={p.xStep} min={0} onChange={(v) => upd({ xStep: v })} />
              <label className="num-field"><span>opis</span><input className="text-input" value={p.xLabel} onChange={(e) => upd({ xLabel: e.target.value })} placeholder="np. U [V]" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Oś Y</legend>
            <div className="num-row">
              <Num label="od" value={p.yMin} onChange={(v) => upd({ yMin: v })} />
              <Num label="do" value={p.yMax} onChange={(v) => upd({ yMax: v })} />
              <Num label="co" value={p.yStep} min={0} onChange={(v) => upd({ yStep: v })} />
              <label className="num-field"><span>opis</span><input className="text-input" value={p.yLabel} onChange={(e) => upd({ yLabel: e.target.value })} placeholder="np. I [mA]" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Wygląd</legend>
            <div className="num-row">
              <Num label="szer. mm" value={p.w} min={30} onChange={(v) => upd({ w: Math.min(210, v) })} />
              <Num label="wys. mm" value={p.h} min={30} onChange={(v) => upd({ h: Math.min(297, v) })} />
              <button className="btn ghost" onClick={unitCm} title="Rozmiar tak, żeby 1 jednostka = 1 cm (zgodnie z kratką)">1 jedn. = 1 cm</button>
            </div>
            <div className="row">
              <label className="check"><input type="checkbox" checked={p.grid} onChange={(e) => upd({ grid: e.target.checked })} /> kratka</label>
              <label className="check"><input type="checkbox" checked={p.numbers} onChange={(e) => upd({ numbers: e.target.checked })} /> liczby przy osiach</label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Dane (opcjonalnie)</legend>
            <p className="muted small" style={{ margin: 0 }}>Wklej dwie kolumny z Excela albo wpisz pary „x y” – po jednej w wierszu. Bez danych dostajesz pusty układ do rysowania rysikiem.</p>
            {p.series.map((s, i) => (
              <div key={i} className="series">
                <div className="row">
                  <input className="text-input" value={s.name} onChange={(e) => updSeries(i, { name: e.target.value })} placeholder="nazwa (legenda)" />
                  {PEN_COLORS.slice(0, 4).map((c) => (
                    <button key={c} className={`swatch ${s.color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => updSeries(i, { color: c })} aria-label={`kolor ${c}`} />
                  ))}
                  <button className="icon-btn sm" title="Usuń serię" onClick={() => { upd({ series: p.series.filter((_, k) => k !== i) }); setTexts(texts.filter((_, k) => k !== i)); }}><Icon name="trash" size={16} /></button>
                </div>
                <textarea
                  className="text-input data-input"
                  rows={5}
                  value={texts[i]}
                  placeholder={'0\t0\n1,5\t2,3\n3\t4,9'}
                  onChange={(e) => { const t = [...texts]; t[i] = e.target.value; setTexts(t); updSeries(i, { points: parsePoints(e.target.value) }); }}
                />
                <div className="row">
                  <span className="muted small" style={{ margin: 0 }}>{s.points.length} punktów</span>
                  <label className="check"><input type="checkbox" checked={s.markers} onChange={(e) => updSeries(i, { markers: e.target.checked })} /> punkty</label>
                  <label className="check"><input type="checkbox" checked={s.line} onChange={(e) => updSeries(i, { line: e.target.checked })} /> linia łamana</label>
                </div>
              </div>
            ))}
            <div className="row">
              <button className="btn ghost" onClick={() => { upd({ series: [...p.series, { name: '', color: PEN_COLORS[(p.series.length + 1) % 4], points: [], line: true, markers: true }] }); setTexts([...texts, '']); }}>
                <Icon name="plus" size={16} /> Dodaj serię danych
              </button>
              {p.series.some((s) => s.points.length) && (
                <button className="btn ghost" onClick={() => { const r = fitToData(p); if (r) upd(r); }}>Dopasuj osie do danych</button>
              )}
            </div>
          </fieldset>
        </div>

        <div className="diagram-preview">
          {valid ? <PlotSvg p={p} style={{ width: '100%', height: 'auto', background: '#fff' }} /> : <p className="muted">Popraw zakresy osi (od &lt; do, podziałka &gt; 0).</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose}>Anuluj</button>
            <button className="btn" disabled={!valid} onClick={() => onSave(p)}>{isNew ? 'Wstaw' : 'Zapisz'}</button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
