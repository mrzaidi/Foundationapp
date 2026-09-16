'use client';

import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { money } from '@/lib/format';
import { EmptyPlot, Gridlines, axisTicks, barPath, niceMax, short } from './primitives';

interface Month {
  month: string;
  total: number;
  donors: number;
  joined: number;
}

const FUND = '#1baf7a';
const JOINED = '#2a78d6';

const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

/**
 * The month's fund and the month's arrivals, over time.
 *
 * These were two tiles showing one number each, which answers "how are we
 * doing now" and nothing about whether that is better or worse than usual. A
 * single figure cannot show a trend, and a trend is what a committee meeting
 * is actually for.
 *
 * Two charts rather than one with two axes: rupees and people share no scale,
 * and a dual axis invites a comparison between them that means nothing.
 */
export default function MonthlyTrends({ showFund = true }: { showFund?: boolean }) {
  const [data, setData] = useState<Month[] | null>(null);
  const [error, setError] = useState('');
  const [months, setMonths] = useState(6);

  useEffect(() => {
    let cancelled = false;
    setError('');

    (async () => {
      try {
        const res = await fetch(`/api/admin/donors/history?months=${months}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? 'Could not load the monthly figures.');
        setData(json.months as Month[]);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [months]);

  if (error)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <p className="err-msg">{error}</p>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <p className="muted" style={{ margin: 0 }}>
            Loading the monthly figures…
          </p>
        </div>
      </div>
    );

  const latest = data[data.length - 1];

  return (
    <div className={`trend-row mt-16 ${showFund ? '' : 'one-up'}`}>
      {/* The money half is a budget figure, so a level without the budget
          sees only who arrived. */}
      {showFund && (
      <TrendChart
        title="Fund by month"
        sub="What donors gave, month by month"
        icon="budget"
        colour={FUND}
        months={data}
        value={(m) => m.total}
        format={(n) => money(n)}
        headline={money(latest?.total ?? 0)}
        headlineLabel={`${monthLabel(latest?.month ?? '')} so far`}
        empty="No donations recorded in this period."
        range={months}
        onRange={setMonths}
      />
      )}
      <TrendChart
        title="New members by month"
        sub="Accounts registered, month by month"
        icon="users"
        colour={JOINED}
        months={data}
        value={(m) => m.joined}
        format={(n) => `${n}`}
        headline={String(latest?.joined ?? 0)}
        headlineLabel={`joined in ${monthLabel(latest?.month ?? '')}`}
        empty="Nobody registered in this period."
        range={months}
        onRange={setMonths}
      />
    </div>
  );
}

function TrendChart({
  title,
  sub,
  icon,
  colour,
  months,
  value,
  format,
  headline,
  headlineLabel,
  empty,
  range,
  onRange,
}: {
  title: string;
  sub: string;
  icon: string;
  colour: string;
  months: Month[];
  value: (m: Month) => number;
  format: (n: number) => string;
  headline: string;
  headlineLabel: string;
  empty: string;
  range: number;
  onRange: (n: number) => void;
}) {
  const W = 460;
  const H = 210;
  const x0 = 44;
  const y0 = 14;
  const plotW = W - x0 - 12;
  const plotH = H - y0 - 30;

  const values = months.map(value);
  const any = values.some((v) => v > 0);
  const max = niceMax(Math.max(1, ...values));
  const ticks = axisTicks(max);
  const step = plotW / Math.max(1, months.length);
  const barW = Math.min(34, step * 0.6);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <div className="ph-sub">{sub}</div>
        </div>
        <Icon name={icon} />
      </div>

      <div className="panel-body">
        {/* The figure that used to be the tile, kept where it can still be read
            at a glance — the chart adds the trend rather than replacing it. */}
        <div className="trend-headline">
          <strong className="num" style={{ color: colour }}>
            {headline}
          </strong>
          <span>{headlineLabel}</span>
          <div className="chips" style={{ marginInlineStart: 'auto' }}>
            {[6, 12].map((n) => (
              <button
                key={n}
                type="button"
                className={`chip ${range === n ? 'active' : ''}`}
                onClick={() => onRange(n)}
              >
                {n}m
              </button>
            ))}
          </div>
        </div>

        {!any ? (
          <EmptyPlot label={empty} />
        ) : (
          <div className="vz-plot">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
              <Gridlines ticks={ticks} max={max} plotW={plotW} plotH={plotH} x0={x0} y0={y0} />
              {months.map((m, i) => {
                const v = value(m);
                const h = max === 0 ? 0 : (v / max) * plotH;
                const x = x0 + i * step + (step - barW) / 2;
                const y = y0 + plotH - h;
                return (
                  <g key={m.month}>
                    {h > 0 && <path d={barPath(x, y, barW, h)} fill={colour} />}
                    {v > 0 && (
                      <text
                        x={x + barW / 2}
                        y={y - 5}
                        className="vz-rowvalue num"
                        textAnchor="middle"
                      >
                        {short(v)}
                      </text>
                    )}
                    <text
                      x={x + barW / 2}
                      y={y0 + plotH + 16}
                      className="vz-tick"
                      textAnchor="middle"
                    >
                      {months.length > 8 && i % 2 === 1 ? '' : monthLabel(m.month)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {any && (
          <details className="vz-table">
            <summary>See the figures</summary>
            <table className="grid">
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td className="num">{format(value(m))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </div>
  );
}
