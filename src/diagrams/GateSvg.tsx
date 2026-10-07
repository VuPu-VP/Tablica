import type { CircuitEl, GateKind } from '../db/types';
import { gateGeom } from './circuit';

// Bramki logiczne w dwóch stylach:
//  • IEC 60617 (PN-EN): prostokąt z oznaczeniem funkcji – &, ≥1, =1, 1; negacja = kółko na wyjściu,
//  • ANSI/IEEE 91: kształty „D” (AND), „pocisk” (OR), trójkąt (NOT).
// Wszystko w mm, środek bramki w punkcie a; wejścia na x = −7,5, wyjście na x = +7,5.

const SW = 0.35;
const NEGATED: GateKind[] = ['NAND', 'NOR', 'XNOR', 'NOT'];
const IEC_TEXT: Record<GateKind, string> = { AND: '&', NAND: '&', OR: '≥1', NOR: '≥1', XOR: '=1', XNOR: '=1', NOT: '1', BUF: '1' };

const orFamily = (k: GateKind) => k === 'OR' || k === 'NOR' || k === 'XOR' || k === 'XNOR';
const xorFamily = (k: GateKind) => k === 'XOR' || k === 'XNOR';

export function GateSymbol({ e, style, color }: { e: CircuitEl; style: 'iec' | 'ansi'; color: string }) {
  const kind = e.kind as GateKind;
  const g = gateGeom(e);
  const hh = g.h / 2;
  const neg = NEGATED.includes(kind);
  const tri = kind === 'NOT' || kind === 'BUF';
  // gdzie kończy się ciało symbolu po prawej (początek kółka negacji / wyprowadzenia wyjścia)
  const bodyRight = style === 'ansi' && tri ? 4 : 5;
  const outStart = neg ? bodyRight + 1.5 : bodyRight;

  /** Lewa krawędź ciała na wysokości y – dla OR/XOR w stylu ANSI jest wklęsła. */
  const inputEdge = (y: number) => {
    if (style === 'iec') return -5;
    if (!orFamily(kind)) return -5;
    const t = (y / hh + 1) / 2;
    const base = xorFamily(kind) ? -6.5 : -5;
    return base + 6 * t * (1 - t); // ta sama krzywa co w ścieżce: Q z punktem kontrolnym 3 mm w prawo
  };

  let body: React.ReactNode;
  if (style === 'iec') {
    body = (
      <>
        <rect x={-5} y={-hh} width={10} height={g.h} />
        <text x={0} y={-hh + 3.2} textAnchor="middle" fontSize={3.2} fill={color} stroke="none" fontWeight={600}>{IEC_TEXT[kind]}</text>
      </>
    );
  } else if (tri) {
    body = <path d="M-5 -4L-5 4L4 0Z" />;
  } else if (orFamily(kind)) {
    body = (
      <>
        <path d={`M-5 ${-hh}Q-2 0 -5 ${hh}Q1 ${hh} 5 0Q1 ${-hh} -5 ${-hh}Z`} />
        {xorFamily(kind) && <path d={`M-6.5 ${-hh}Q-3.5 0 -6.5 ${hh}`} />}
      </>
    );
  } else {
    body = <path d={`M-5 ${-hh}H0A5 ${hh} 0 0 1 0 ${hh}H-5Z`} />;
  }

  const [x, y] = e.a;
  return (
    <g>
      <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {body}
        {g.ins.map(([, py], i) => {
          const ly = py - y;
          return <line key={i} x1={-7.5} y1={ly} x2={inputEdge(ly)} y2={ly} />;
        })}
        {neg && <circle cx={bodyRight + 0.75} cy={0} r={0.75} />}
        <line x1={outStart} y1={0} x2={7.5} y2={0} />
      </g>
      {e.label && (
        <text x={x} y={y - hh - 1.8} textAnchor="middle" fontSize={3} fill={color} fontStyle="italic">{e.label}</text>
      )}
    </g>
  );
}

/** Wejście (A, B…) albo wyjście (Y) układu: kółko na końcu przewodu + podpis. */
export function IoTerminal({ e, color }: { e: CircuitEl; color: string }) {
  const [x, y] = e.a;
  const isIn = e.kind === 'in';
  return (
    <g>
      <circle cx={x} cy={y} r={0.75} fill="#fff" stroke={color} strokeWidth={SW} />
      {e.label && (
        <text x={isIn ? x - 1.8 : x + 1.8} y={y} textAnchor={isIn ? 'end' : 'start'} dominantBaseline="central" fontSize={3.2} fill={color} fontWeight={600}>
          {e.label}
        </text>
      )}
    </g>
  );
}
