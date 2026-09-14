'use client';

/**
 * Chart primitives.
 *
 * Mark specs are fixed across every chart here: bars cap at 24px and carry a
 * 4px rounded data-end squared at the baseline, gridlines are solid hairlines
 * one step off the surface, and touching fills are separated by a 2px gap in
 * the surface colour rather than a stroke.
 */

export const BAR_MAX = 24;
export const GAP = 2; // surface gap between touching fills

/** A bar rounded at the data end only, square where it meets the baseline. */
export function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rad = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `L${x},${y + rad}`,
    `Q${x},${y} ${x + rad},${y}`,
    `L${x + w - rad},${y}`,
    `Q${x + w},${y} ${x + w},${y + rad}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

/** Horizontal variant — rounded at the right-hand data end. */
export function barPathH(x: number, y: number, w: number, h: number, r = 4) {
  if (w <= 0) return '';
  const rad = Math.min(r, h / 2, w);
  return [
    `M${x},${y}`,
    `L${x + w - rad},${y}`,
    `Q${x + w},${y} ${x + w},${y + rad}`,
    `L${x + w},${y + h - rad}`,
    `Q${x + w},${y + h} ${x + w - rad},${y + h}`,
    `L${x},${y + h}`,
    'Z',
  ].join(' ');
}

/** "Nice" axis maximum so ticks land on round numbers. */
export function niceMax(value: number, ticks = 4) {
  if (value <= 0) return ticks;
  const rough = value / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return Math.ceil(value / step) * step;
}

export function axisTicks(max: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

/** Compact axis labels: 1.2M, 18K, 940. */
export function short(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${+(n / 1_000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export function Gridlines({
  ticks,
  max,
  plotW,
  plotH,
  x0,
  y0,
}: {
  ticks: number[];
  max: number;
  plotW: number;
  plotH: number;
  x0: number;
  y0: number;
}) {
  return (
    <g className="vz-grid" aria-hidden="true">
      {ticks.map((t) => {
        const y = y0 + plotH - (max === 0 ? 0 : (t / max) * plotH);
        return (
          <g key={t}>
            <line x1={x0} y1={y} x2={x0 + plotW} y2={y} />
            <text x={x0 - 8} y={y + 3.5} className="vz-tick" textAnchor="end">
              {short(t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string; value?: string }[];
}) {
  return (
    <ul className="vz-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className="vz-swatch" style={{ background: i.color }} />
          <span className="vz-legend-label">{i.label}</span>
          {i.value && <span className="vz-legend-value num">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function EmptyPlot({ label }: { label: string }) {
  return <p className="vz-empty">{label}</p>;
}
