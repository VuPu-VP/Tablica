import { useEffect, useRef, useState } from 'react';
import { newId } from '../db/repo';
import type { CircuitEl, CircuitKind, CircuitObj, GateKind } from '../db/types';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { GRID, ONE_INPUT, SINGLE_POINT, circuitBounds, hitDistance, isGate, nextLabel, normalize, snap } from './circuit';
import { CircuitElement, CircuitShapes } from './CircuitSvg';

type Tool = CircuitKind | 'select' | 'delete';
type Tab = 'analog' | 'digital';
type GateStyle = 'iec' | 'ansi';

const ANALOG: { kind: CircuitKind; name: string }[] = [
  { kind: 'wire', name: 'Przewód' },
  { kind: 'R', name: 'Rezystor' },
  { kind: 'L', name: 'Cewka' },
  { kind: 'C', name: 'Kondensator' },
  { kind: 'V', name: 'Źródło napięcia' },
  { kind: 'battery', name: 'Bateria' },
  { kind: 'AC', name: 'Źródło przemienne' },
  { kind: 'I', name: 'Źródło prądu' },
  { kind: 'switch', name: 'Łącznik' },
  { kind: 'diode', name: 'Dioda' },
  { kind: 'lamp', name: 'Żarówka' },
  { kind: 'ammeter', name: 'Amperomierz' },
  { kind: 'voltmeter', name: 'Woltomierz' },
  { kind: 'ground', name: 'Masa' },
  { kind: 'node', name: 'Węzeł' },
];

const DIGITAL: { kind: CircuitKind; name: string }[] = [
  { kind: 'wire', name: 'Przewód' },
  { kind: 'AND', name: 'AND' },
  { kind: 'OR', name: 'OR' },
  { kind: 'NOT', name: 'NOT' },
  { kind: 'NAND', name: 'NAND' },
  { kind: 'NOR', name: 'NOR' },
  { kind: 'XOR', name: 'XOR' },
  { kind: 'XNOR', name: 'XNOR' },
  { kind: 'BUF', name: 'Bufor' },
  { kind: 'in', name: 'Wejście' },
  { kind: 'out', name: 'Wyjście' },
  { kind: 'node', name: 'Węzeł' },
];

const TAB_KEY = 'tablica.circuitTab';

/** Miniatura symbolu na przycisku palety. */
function PaletteIcon({ kind, gateStyle }: { kind: CircuitKind; gateStyle: GateStyle }) {
  if (isGate(kind)) {
    return (
      <svg viewBox="-1 -6.5 18 13" width={44} height={30} aria-hidden="true">
        <CircuitElement e={{ id: 'p', kind, a: [8, 0], b: [8, 0], inputs: 2 }} gateStyle={gateStyle} />
      </svg>
    );
  }
  const single = SINGLE_POINT.includes(kind);
  const label = kind === 'in' ? 'A' : kind === 'out' ? 'Y' : undefined;
  const px = kind === 'in' ? 12 : kind === 'out' ? 4 : 8;
  const e: CircuitEl = { id: 'p', kind, label, a: single ? [px, kind === 'ground' ? -2 : 0] : [0, 0], b: single ? [px, kind === 'ground' ? -2 : 0] : [16, 0] };
  return (
    <svg viewBox="-1 -5 18 10" width={44} height={24} aria-hidden="true">
      <CircuitElement e={e} />
    </svg>
  );
}

/** Piksele na milimetr w obszarze edycji. */
const S = 5;

export function CircuitEditor({ initial, isNew, onSave, onClose }: { initial: CircuitObj; isNew: boolean; onSave: (c: CircuitObj) => void; onClose: () => void }) {
  const [els, setEls] = useState<CircuitEl[]>(initial.elements);
  const [undo, setUndo] = useState<CircuitEl[][]>([]);
  const [tab, setTab] = useState<Tab>(() => {
    if (initial.elements.some((e) => isGate(e.kind))) return 'digital';
    if (initial.elements.length) return 'analog';
    try { return (localStorage.getItem(TAB_KEY) as Tab) || 'analog'; } catch { return 'analog'; }
  });
  const [gateStyle, setGateStyle] = useState<GateStyle>(initial.gateStyle ?? 'iec');
  const [inputs, setInputs] = useState(2);
  const [tool, setTool] = useState<Tool>(initial.elements.length ? 'select' : 'wire');
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignorujemy */ } }, [tab]);

  // Aktualna lista zawsze w refie – szybkie gesty rysikiem potrafią wyprzedzić przerysowanie Reacta.
  const elsRef = useRef(els);
  elsRef.current = els;
  const change = (next: CircuitEl[]) => {
    const prev = elsRef.current;
    elsRef.current = next;
    setUndo((u) => [...u.slice(-50), prev]);
    setEls(next);
  };
  const dragRef = useRef<{ a: [number, number]; b: [number, number] } | null>(null);
  const setDragBoth = (d: { a: [number, number]; b: [number, number] } | null) => { dragRef.current = d; setDrag(d); };
  const selected = els.find((e) => e.id === sel);
  const update = (patch: Partial<CircuitEl>, undoable = false) => {
    const next = els.map((x) => (x.id === sel ? { ...x, ...patch } : x));
    if (undoable) change(next); else setEls(next);
  };

  // obszar roboczy: co najmniej 180 × 100 mm, rośnie razem ze schematem
  const b = circuitBounds(els, 0);
  const W = Math.max(180, (els.length ? b.maxX : 0) + 30);
  const H = Math.max(100, (els.length ? b.maxY : 0) + 25);

  const toMm = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [snap((e.clientX - r.left) / S), snap((e.clientY - r.top) / S)];
  };
  const raw = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / S, (e.clientY - r.top) / S];
  };
  const nearest = (x: number, y: number, max = 2.5) => {
    let best: CircuitEl | null = null, bd = max;
    for (const e of els) { const d = hitDistance(e, x, y); if (d < bd) { bd = d; best = e; } }
    return best;
  };

  /** Nowy element punktowy (bramka, wejście, wyjście, masa, węzeł) w punkcie p. */
  const pointElement = (kind: CircuitKind, p: [number, number]): CircuitEl => ({
    id: newId(),
    kind,
    a: p,
    b: p,
    label: nextLabel(elsRef.current, kind),
    inputs: isGate(kind) && !ONE_INPUT.includes(kind as GateKind) ? inputs : undefined,
  });

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignorujemy */ }
    const p = toMm(e);
    if (tool === 'select' || tool === 'delete') {
      const hit = nearest(...raw(e));
      if (tool === 'delete') { if (hit) change(elsRef.current.filter((x) => x !== hit)); }
      else setSel(hit?.id ?? null);
      return;
    }
    if (SINGLE_POINT.includes(tool)) {
      const el = pointElement(tool, p);
      change([...elsRef.current, el]);
      return;
    }
    setDragBoth({ a: p, b: p });
  };
  const onMove = (e: React.PointerEvent) => {
    const p = toMm(e);
    setHover(p);
    if (dragRef.current) setDragBoth({ ...dragRef.current, b: p });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || tool === 'select' || tool === 'delete') return;
    const a = d.a;
    const end = toMm(e); // punkt puszczenia – nie polegamy na ostatnim pointermove
    setDragBoth(null);
    if (a[0] === end[0] && a[1] === end[1]) return;
    const el: CircuitEl = { id: newId(), kind: tool, a, b: end, label: nextLabel(elsRef.current, tool) };
    change([...elsRef.current, el]);
    if (tool !== 'wire') setSel(el.id);
  };

  // Klawiatura: Delete usuwa zaznaczony, Ctrl+Z cofa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); change(els.filter((x) => x.id !== sel)); setSel(null); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const doUndo = () => {
    const prev = undo.at(-1);
    if (!prev) return;
    setUndo(undo.slice(0, -1));
    setEls(prev);
  };

  const save = () => {
    const n = normalize(els);
    const s = initial.s || 1;
    onSave({
      ...initial,
      elements: n.elements,
      gateStyle,
      // schemat nie „skacze” na kartce: przesunięcie elementów kompensujemy położeniem obiektu
      x: Math.round((initial.x + n.dx * s) * 100) / 100,
      y: Math.round((initial.y + n.dy * s) * 100) / 100,
      w: n.w * s,
      h: n.h * s,
    });
  };

  const preview: CircuitEl | null = drag && tool !== 'select' && tool !== 'delete'
    ? { id: 'preview', kind: tool, a: drag.a, b: drag.b, label: undefined }
    : hover && tool !== 'select' && tool !== 'delete' && isGate(tool)
      ? { id: 'preview', kind: tool, a: hover, b: hover, inputs } // bramka „wisi” pod kursorem przed kliknięciem
      : null;

  const palette = tab === 'analog' ? ANALOG : DIGITAL;
  const selIsGate = selected && isGate(selected.kind);
  const selIsDigital = selected && (selIsGate || selected.kind === 'in' || selected.kind === 'out');

  const hint = tool === 'select' ? 'Kliknij element, aby zmienić jego podpis, liczbę wejść lub kierunek.'
    : tool === 'delete' ? 'Kliknij element, aby go usunąć.'
    : isGate(tool) ? 'Kliknij, aby postawić bramkę – wejścia z lewej, wyjście z prawej. Potem połącz je przewodami.'
    : tool === 'in' || tool === 'out' ? 'Kliknij koniec przewodu, który ma być wejściem (A, B…) lub wyjściem (Y) układu.'
    : SINGLE_POINT.includes(tool) ? 'Kliknij punkt siatki.'
    : tab === 'digital' ? 'Przeciągnij od punktu do punktu. Kropki w rozgałęzieniach dodają się same.'
    : 'Przeciągnij od punktu do punktu. Źródła i baterię przeciągaj od „−” do „+”. Kropki w rozgałęzieniach dodają się same.';

  return (
    <Dialog title={isNew ? 'Nowy schemat' : 'Edycja schematu'} onClose={onClose} wide>
      <div className="circuit-editor">
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="seg" role="tablist" aria-label="Rodzaj elementów">
            <button role="tab" aria-selected={tab === 'analog'} className={tab === 'analog' ? 'on' : ''} onClick={() => setTab('analog')}>Analogowe (RLC)</button>
            <button role="tab" aria-selected={tab === 'digital'} className={tab === 'digital' ? 'on' : ''} onClick={() => setTab('digital')}>Cyfrowe (bramki)</button>
          </div>
          {tab === 'digital' && (
            <>
              <span className="muted small" style={{ margin: 0 }}>Wejść:</span>
              <div className="seg" role="radiogroup" aria-label="Liczba wejść nowych bramek">
                {[2, 3, 4].map((n) => <button key={n} className={inputs === n ? 'on' : ''} onClick={() => setInputs(n)}>{n}</button>)}
              </div>
              <span className="muted small" style={{ margin: 0 }}>Symbole:</span>
              <div className="seg" role="radiogroup" aria-label="Styl symboli bramek">
                <button className={gateStyle === 'iec' ? 'on' : ''} onClick={() => setGateStyle('iec')} title="Prostokąty z &, ≥1, =1 (PN-EN / IEC 60617)">IEC</button>
                <button className={gateStyle === 'ansi' ? 'on' : ''} onClick={() => setGateStyle('ansi')} title="Klasyczne kształty (ANSI/IEEE)">ANSI</button>
              </div>
            </>
          )}
        </div>
        <div className="palette" role="toolbar" aria-label="Elementy">
          <button className={`pal-btn ${tool === 'select' ? 'on' : ''}`} onClick={() => setTool('select')} title="Zaznacz element, aby zmienić podpis"><Icon name="lasso" size={18} /><span>Zaznacz</span></button>
          <button className={`pal-btn ${tool === 'delete' ? 'on' : ''}`} onClick={() => { setTool('delete'); setSel(null); }} title="Kliknij element, aby go usunąć"><Icon name="eraser" size={18} /><span>Usuń</span></button>
          {palette.map((p) => (
            <button key={p.kind} className={`pal-btn ${tool === p.kind ? 'on' : ''}`} onClick={() => { setTool(p.kind); setSel(null); }} title={p.name}>
              <PaletteIcon kind={p.kind} gateStyle={gateStyle} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <p className="muted small">{hint}</p>
        <div className="circuit-canvas">
          <svg
            ref={svgRef}
            width={W * S}
            height={H * S}
            viewBox={`0 0 ${W} ${H}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDragBoth(null)}
            onPointerLeave={() => setHover(null)}
            style={{ touchAction: 'none', cursor: tool === 'select' ? 'pointer' : tool === 'delete' ? 'not-allowed' : 'crosshair' }}
          >
            <defs>
              <pattern id="cgrid" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
                <circle cx={0} cy={0} r={0.25} fill="#9fb0c8" />
                <circle cx={GRID} cy={0} r={0.12} fill="#c3cedd" />
                <circle cx={0} cy={GRID} r={0.12} fill="#c3cedd" />
                <circle cx={GRID} cy={GRID} r={0.12} fill="#c3cedd" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="#fff" />
            <rect width={W} height={H} fill="url(#cgrid)" />
            <CircuitShapes elements={els} highlight={sel} gateStyle={gateStyle} />
            {preview && <g opacity={0.5}><CircuitElement e={preview} color="#3b5bdb" gateStyle={gateStyle} /></g>}
            {hover && tool !== 'select' && tool !== 'delete' && <circle cx={hover[0]} cy={hover[1]} r={0.8} fill="none" stroke="#3b5bdb" strokeWidth={0.25} />}
          </svg>
        </div>
        <div className="row circuit-footer">
          {selected ? (
            <>
              <label className="num-field" style={{ flex: 1 }}>
                <span>Podpis</span>
                <input
                  className="text-input"
                  value={selected.label ?? ''}
                  placeholder={selIsGate ? 'np. U1 (opcjonalnie)' : selIsDigital ? 'np. A, B, CLK, Y' : 'np. R1 = 10 Ω'}
                  onChange={(e) => update({ label: e.target.value })}
                />
              </label>
              {selIsGate && !ONE_INPUT.includes(selected.kind as GateKind) && (
                <div className="seg" role="radiogroup" aria-label="Liczba wejść bramki">
                  {[2, 3, 4].map((n) => (
                    <button key={n} className={(selected.inputs ?? 2) === n ? 'on' : ''} onClick={() => update({ inputs: n }, true)}>{n} wej.</button>
                  ))}
                </div>
              )}
              {!selIsDigital && (
                <>
                  {['Ω', 'µF', 'mH', 'V', 'A', '~'].map((u) => (
                    <button key={u} className="btn ghost sm" onClick={() => update({ label: (selected.label ?? '') + u })}>{u}</button>
                  ))}
                  <button className="btn ghost" title="Zamień kierunek (biegunowość źródła, kierunek diody)" onClick={() => update({ a: selected.b, b: selected.a }, true)}>⇄ Odwróć</button>
                </>
              )}
              <button className="btn ghost" onClick={() => { change(els.filter((x) => x.id !== sel)); setSel(null); }}><Icon name="trash" size={16} /> Usuń</button>
            </>
          ) : <span className="spacer" />}
          <button className="btn ghost" disabled={!undo.length} onClick={doUndo}><Icon name="undo" size={16} /> Cofnij</button>
          <button className="btn ghost" onClick={onClose}>Anuluj</button>
          <button className="btn" disabled={!els.length} onClick={save}>{isNew ? 'Wstaw' : 'Zapisz'}</button>
        </div>
      </div>
    </Dialog>
  );
}
