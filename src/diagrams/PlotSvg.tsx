import type { PlotObj } from '../db/types';
import { PLOT_MARGIN, fmtTick, ticks } from './plot';

export { PLOT_MARGIN };

const INK = '#1b1c1f';
const GRID = '#c3cedd';

/**
 * Układ współrzędnych w milimetrach (viewBox = rozmiar obiektu na kartce).
 * Domyślnie 1 jednostka = 1 cm, a obszar wykresu zaczyna się w kratce – osie leżą na liniach kratki.
 */
export function PlotSvg({ p, className, style }: { p: PlotObj; className?: string; style?: React.CSSProperties }) {
  const M = PLOT_MARGIN;
  const W = Math.max(1, p.w - 2 * M);
  const H = Math.max(1, p.h - 2 * M);
  const sx = p.xMax > p.xMin ? W / (p.xMax - p.xMin) : 1;
  const sy = p.yMax > p.yMin ? H / (p.yMax - p.yMin) : 1;
  const X = (v: number) => M + (v - p.xMin) * sx;
  const Y = (v: number) => M + H - (v - p.yMin) * sy;
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const axisY = Y(clamp(0, p.yMin, p.yMax)); // wysokość osi X
  const axisX = X(clamp(0, p.xMin, p.xMax)); // położenie osi Y
  const xt = ticks(p.xMin, p.xMax, p.xStep);
  const yt = ticks(p.yMin, p.yMax, p.yStep);
  // przy gęstej podziałce opisujemy co n-tą kreskę, żeby liczby na siebie nie wchodziły
  const everyX = Math.max(1, Math.ceil(5 / (p.xStep * sx)));
  const everyY = Math.max(1, Math.ceil(3.5 / (p.yStep * sy)));
  const originInside = p.xMin <= 0 && p.xMax >= 0 && p.yMin <= 0 && p.yMax >= 0;
  const clipId = `clip-${p.id}`;
  const named = p.series.filter((s) => s.name.trim());

  return (
    <svg className={className} style={{ overflow: 'visible', ...style }} viewBox={`0 0 ${p.w} ${p.h}`} xmlns="http://www.w3.org/2000/svg" fontFamily="'Inter Variable', Inter, sans-serif">
      <defs>
        <clipPath id={clipId}><rect x={M} y={M} width={W} height={H} /></clipPath>
      </defs>
      {p.grid && (
        <g stroke={GRID} strokeWidth={0.18}>
          {xt.map((v) => <line key={`gx${v}`} x1={X(v)} y1={M} x2={X(v)} y2={M + H} />)}
          {yt.map((v) => <line key={`gy${v}`} x1={M} y1={Y(v)} x2={M + W} y2={Y(v)} />)}
        </g>
      )}
      {/* osie ze strzałkami */}
      <g stroke={INK} strokeWidth={0.35} fill={INK}>
        <line x1={M} y1={axisY} x2={M + W + 3} y2={axisY} />
        <polygon points={`${M + W + 4},${axisY} ${M + W + 2},${axisY - 0.9} ${M + W + 2},${axisY + 0.9}`} strokeWidth={0.1} />
        <line x1={axisX} y1={M + H} x2={axisX} y2={M - 3} />
        <polygon points={`${axisX},${M - 4} ${axisX - 0.9},${M - 2} ${axisX + 0.9},${M - 2}`} strokeWidth={0.1} />
        {xt.map((v) => <line key={`tx${v}`} x1={X(v)} y1={axisY - 0.7} x2={X(v)} y2={axisY + 0.7} strokeWidth={0.25} />)}
        {yt.map((v) => <line key={`ty${v}`} x1={axisX - 0.7} y1={Y(v)} x2={axisX + 0.7} y2={Y(v)} strokeWidth={0.25} />)}
      </g>
      {p.numbers && (
        <g fill={INK} fontSize={2.5}>
          {xt.map((v, i) => (v === 0 && originInside) || i % everyX ? null : (
            <text key={`nx${v}`} x={X(v)} y={axisY + 3.3} textAnchor="middle">{fmtTick(v)}</text>
          ))}
          {yt.map((v, i) => (v === 0 && originInside) || i % everyY ? null : (
            <text key={`ny${v}`} x={axisX - 1.3} y={Y(v) + 0.9} textAnchor="end">{fmtTick(v)}</text>
          ))}
          {originInside && <text x={axisX - 1.3} y={axisY + 3.3} textAnchor="end">0</text>}
        </g>
      )}
      <g fill={INK} fontSize={3} fontStyle="italic">
        {p.xLabel && <text x={M + W + 4} y={axisY - 1.6} textAnchor="end">{p.xLabel}</text>}
        {p.yLabel && <text x={axisX + 1.6} y={M - 1.8}>{p.yLabel}</text>}
      </g>
      {/* serie danych */}
      <g clipPath={`url(#${clipId})`}>
        {p.series.map((s, i) => (
          <g key={i}>
            {s.line && s.points.length > 1 && (
              <polyline points={s.points.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={0.4} strokeLinejoin="round" />
            )}
            {s.markers && s.points.map(([x, y], k) => <circle key={k} cx={X(x)} cy={Y(y)} r={0.75} fill={s.color} />)}
          </g>
        ))}
      </g>
      {named.length > 0 && (
        <g fontSize={2.6} fill={INK}>
          <rect x={M + W - 32} y={M + 0.5} width={31.5} height={named.length * 4 + 1.5} fill="#ffffff" fillOpacity={0.85} stroke={GRID} strokeWidth={0.2} rx={0.8} />
          {named.map((s, i) => (
            <g key={i} transform={`translate(${M + W - 30} ${M + 3.5 + i * 4})`}>
              <line x1={0} y1={-0.9} x2={4} y2={-0.9} stroke={s.color} strokeWidth={0.5} />
              <circle cx={2} cy={-0.9} r={0.6} fill={s.color} />
              <text x={5.5} y={0}>{s.name.slice(0, 18)}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
