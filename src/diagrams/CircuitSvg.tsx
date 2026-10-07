import type { CircuitEl, CircuitKind, CircuitObj } from '../db/types';
import { isGate, junctions } from './circuit';
import { GateSymbol, IoTerminal } from './GateSvg';

// Symbole elementów wg IEC 60617 (standard w polskich podręcznikach), w milimetrach.
// Każdy element dwukońcówkowy rysujemy wzdłuż osi X: wyprowadzenia + „ciało” symbolu na środku,
// a potem obracamy go w kierunku od punktu a do b.

const INK = '#1b1c1f';
const SW = 0.35;

/** Długość „ciała” symbolu (mm); resztę odcinka wypełniają wyprowadzenia. */
const BODY: Partial<Record<CircuitKind, number>> = {
  wire: 0, R: 10, L: 10, C: 1.5, V: 7, I: 7, AC: 7, battery: 1.6, switch: 8,
  diode: 5, lamp: 6, ammeter: 7, voltmeter: 7, ground: 0, node: 0,
};

/** Mały znak „+” (biegun dodatni) – z kresek, żeby obracał się razem z symbolem. */
const Plus = ({ x, y }: { x: number; y: number }) => (
  <g strokeWidth={0.25}><line x1={x - 0.7} y1={y} x2={x + 0.7} y2={y} /><line x1={x} y1={y - 0.7} x2={x} y2={y + 0.7} /></g>
);

function body(kind: CircuitKind, angle: number) {
  const letter = (t: string) => (
    <text x={0} y={0} transform={`rotate(${-angle})`} textAnchor="middle" dominantBaseline="central" fontSize={3.6} fill={INK} stroke="none" fontWeight={600}>{t}</text>
  );
  switch (kind) {
    case 'R': return <rect x={-5} y={-2} width={10} height={4} />;
    case 'L': return <path d="M-5 0a1.25 1.25 0 0 1 2.5 0a1.25 1.25 0 0 1 2.5 0a1.25 1.25 0 0 1 2.5 0a1.25 1.25 0 0 1 2.5 0" />;
    case 'C': return <><line x1={-0.75} y1={-3.5} x2={-0.75} y2={3.5} /><line x1={0.75} y1={-3.5} x2={0.75} y2={3.5} /></>;
    case 'V': return <><circle r={3.5} /><line x1={-3.5} y1={0} x2={3.5} y2={0} /><Plus x={5} y={-3} /></>;
    case 'I': return <><circle r={3.5} /><line x1={0} y1={-3.5} x2={0} y2={3.5} /></>;
    case 'AC': return <><circle r={3.5} /><path d="M-2.2 0C-1.6-2.2-0.6-2.2 0 0S1.6 2.2 2.2 0" /></>;
    case 'battery': return <><line x1={0.8} y1={-3.5} x2={0.8} y2={3.5} /><line x1={-0.8} y1={-1.75} x2={-0.8} y2={1.75} strokeWidth={0.9} /><Plus x={2.8} y={-3.6} /></>;
    case 'switch': return <><line x1={-4} y1={0} x2={3.6} y2={-3} /><circle cx={-4} r={0.45} fill={INK} /><circle cx={4} r={0.45} fill="#fff" /></>;
    case 'diode': return <><polygon points="-2.5,-2.5 -2.5,2.5 2.5,0" /><line x1={2.5} y1={-2.5} x2={2.5} y2={2.5} /></>;
    case 'lamp': return <><circle r={3} /><line x1={-2.12} y1={-2.12} x2={2.12} y2={2.12} /><line x1={-2.12} y1={2.12} x2={2.12} y2={-2.12} /></>;
    case 'ammeter': return <><circle r={3.5} />{letter('A')}</>;
    case 'voltmeter': return <><circle r={3.5} />{letter('V')}</>;
    default: return null;
  }
}

export function CircuitElement({ e, color = INK, gateStyle = 'iec' }: { e: CircuitEl; color?: string; gateStyle?: 'iec' | 'ansi' }) {
  if (isGate(e.kind)) return <GateSymbol e={e} style={gateStyle} color={color} />;
  if (e.kind === 'in' || e.kind === 'out') return <IoTerminal e={e} color={color} />;
  const [ax, ay] = e.a;
  const [bx, by] = e.b;
  if (e.kind === 'node') return <circle cx={ax} cy={ay} r={0.75} fill={color} />;
  if (e.kind === 'ground') {
    return (
      <g stroke={color} strokeWidth={SW} transform={`translate(${ax} ${ay})`}>
        <line x1={0} y1={0} x2={0} y2={2.5} /><line x1={-3} y1={2.5} x2={3} y2={2.5} />
        <line x1={-2} y1={3.6} x2={2} y2={3.6} /><line x1={-1} y1={4.7} x2={1} y2={4.7} />
      </g>
    );
  }
  const len = Math.hypot(bx - ax, by - ay);
  if (len === 0) return null;
  const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const full = BODY[e.kind] ?? 0;
  const k = full && len < full + 2 ? Math.max(0.35, (len - 2) / full) : 1; // krótki odcinek → mniejszy symbol
  const bl = full * k;
  // podpis: obok środka elementu, po „lewej” stronie kierunku a→b (dla poziomego – nad elementem)
  const nx = (by - ay) / len, ny = -(bx - ax) / len;
  const off = full ? 5.2 : 2.5;
  const lx = (ax + bx) / 2 + nx * off;
  const ly = (ay + by) / 2 + ny * off;
  return (
    <g>
      <g transform={`translate(${ax} ${ay}) rotate(${angle})`} stroke={color} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={0} y1={0} x2={(len - bl) / 2} y2={0} />
        <line x1={(len + bl) / 2} y1={0} x2={len} y2={0} />
        {full > 0 && <g transform={`translate(${len / 2} 0) scale(${k})`}>{body(e.kind, angle)}</g>}
      </g>
      {e.label && (
        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={3} fill={color} fontStyle="italic">{e.label}</text>
      )}
    </g>
  );
}

/** Elementy schematu + automatyczne kropki w węzłach. */
export function CircuitShapes({ elements, highlight, gateStyle }: { elements: CircuitEl[]; highlight?: string | null; gateStyle?: 'iec' | 'ansi' }) {
  return (
    <g fontFamily="'Inter Variable', Inter, sans-serif">
      {elements.map((e) => <CircuitElement key={e.id} e={e} gateStyle={gateStyle} color={e.id === highlight ? '#3b5bdb' : INK} />)}
      {junctions(elements).map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={0.75} fill={INK} />)}
    </g>
  );
}

export function CircuitSvg({ c, className, style }: { c: CircuitObj; className?: string; style?: React.CSSProperties }) {
  const s = c.s || 1;
  return (
    <svg className={className} style={{ overflow: 'visible', ...style }} viewBox={`0 0 ${c.w / s} ${c.h / s}`} xmlns="http://www.w3.org/2000/svg">
      <CircuitShapes elements={c.elements} gateStyle={c.gateStyle} />
    </svg>
  );
}
