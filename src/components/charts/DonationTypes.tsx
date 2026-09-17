'use client';

import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { money } from '@/lib/format';
import {
  DONATION_COLOUR,
  DONATION_LABEL,
  DONATION_TYPES,
  type DonationType,
} from '@/lib/donation-types';
import { EmptyPlot, barPathH, short } from './primitives';

interface TypeTotal {
  donation_type: string;
  total: number;
  gifts: number;
}

interface TypeMonth {
  month: string;
  by_type: Record<string, number>;
  total: number;
}

interface Payload {
  month: string;
  totals: TypeTotal[];
  months: TypeMonth[];
}

const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

const fullMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * What kind of giving arrived, and how that has moved.
 *
 * Khums, Zakat and the rest are distinct obligations with different rules
 * about what they may be spent on, so a committee needs them apart as well as
 * together. The month's split answers "what have we been given"; the stacked
 * months answer "is that changing" — a foundation whose Zakat is steady while
 * its Sadaqah falls away has a different problem from one whose total is
 * simply smaller.
 *
 * The totals here are the same money the budget already counts. Nothing is
 * added or held back by splitting it up.
 */
export default function DonationTypes() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [months, setMonths] = useState(6);
  // Absent until migration 0018 runs; the panel stays out of the way rather
  // than showing a Postgres error next to the donor list.
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setError('');

    (async () => {
      try {
        const res = await fetch(`/api/admin/donors/types?months=${months}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? 'Could not load the donation types.');
        setData(json as Payload);
        setAvailable(true);
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message || 'Could not load the donation types.';
        if (/donation_types|schema cache|does not exist|Not Found/i.test(msg)) setAvailable(false);
        else setError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [months]);

  if (!available) return null;

  if (error)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <p className="err-msg mb-0">{error}</p>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <p className="muted" style={{ margin: 0 }}>
            Loading the donation types…
          </p>
        </div>
      </div>
    );

  const totals = (data.totals ?? [])
    .map((t) => ({ ...t, type: t.donation_type as DonationType, total: Number(t.total) }))
    .filter((t) => DONATION_TYPES.includes(t.type));

  const monthTotal = totals.reduce((s, t) => s + t.total, 0);
  const given = totals.filter((t) => t.total > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="type-row mt-16">
      {/* ---- this month, split ---- */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Kinds of giving</h2>
            <div className="ph-sub">{fullMonth(data.month)}, by obligation</div>
          </div>
          <Icon name="heart" />
        </div>

        <div className="panel-body">
          {monthTotal === 0 ? (
            <EmptyPlot label="Nothing has been recorded this month." />
          ) : (
            <>
              <div className="trend-headline">
                <strong className="num" style={{ color: 'var(--brand-2)' }}>
                  {money(monthTotal)}
                </strong>
                <span>
                  across {given.length} kind{given.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* A bar each, longest first, with the figure on it — these are
                  amounts a treasurer reads off, not a shape to admire. */}
              <div className="vz-plot">
                <svg viewBox={`0 0 460 ${given.length * 30 + 8}`} role="img" aria-label="Giving by kind">
                  {given.map((t, i) => {
                    const w = (t.total / given[0].total) * 300;
                    return (
                      <g key={t.type}>
                        <text x={0} y={i * 30 + 20} className="vz-tick">
                          {DONATION_LABEL[t.type]}
                        </text>
                        <path
                          d={barPathH(126, i * 30 + 8, Math.max(2, w), 16)}
                          fill={DONATION_COLOUR[t.type]}
                        />
                        <text x={126 + Math.max(2, w) + 8} y={i * 30 + 20} className="vz-rowvalue num">
                          {short(t.total)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <details className="vz-table">
                <summary>See the figures</summary>
                <table className="grid">
                  <tbody>
                    {given.map((t) => (
                      <tr key={t.type}>
                        <td>
                          <span
                            className="type-dot"
                            style={{ background: DONATION_COLOUR[t.type] }}
                          />
                          {DONATION_LABEL[t.type]}
                        </td>
                        <td className="num" style={{ textAlign: 'end' }}>
                          {money(t.total)}
                        </td>
                        <td
                          className="num"
                          style={{ textAlign: 'end', color: 'var(--text-faint)' }}
                        >
                          {Math.round((t.total / monthTotal) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </div>
      </div>

      {/* ---- the same split, month by month ---- */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Kinds of giving by month</h2>
            <div className="ph-sub">Each month stacked, so the mix is visible</div>
          </div>
          <div className="chips">
            {[6, 12].map((n) => (
              <button
                key={n}
                type="button"
                className={`chip ${months === n ? 'active' : ''}`}
                onClick={() => setMonths(n)}
              >
                {n}m
              </button>
            ))}
          </div>
        </div>

        <div className="panel-body">
          <StackedMonths months={data.months ?? []} />
          <div className="type-legend">
            {DONATION_TYPES.map((k) => (
              <span key={k}>
                <i style={{ background: DONATION_COLOUR[k] }} />
                {DONATION_LABEL[k]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One bar per month, divided by kind.
 *
 * Stacked rather than grouped: the question is what a month was made of, and
 * eight side-by-side bars per month would be unreadable at this width. Each
 * kind keeps its own colour whether or not it appears, so the eye can follow
 * one obligation across the months.
 */
function StackedMonths({ months }: { months: TypeMonth[] }) {
  const W = 460;
  const H = 210;
  const x0 = 8;
  const y0 = 10;
  const plotW = W - x0 - 10;
  const plotH = H - y0 - 28;

  const totals = months.map((m) => Number(m.total));
  const max = Math.max(1, ...totals);
  if (!totals.some((t) => t > 0))
    return <EmptyPlot label="Nothing has been recorded in this period." />;

  const step = plotW / Math.max(1, months.length);
  const barW = Math.min(38, step * 0.58);

  return (
    <div className="vz-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Kinds of giving by month">
        {months.map((m, i) => {
          const x = x0 + i * step + (step - barW) / 2;
          let cursor = y0 + plotH;

          return (
            <g key={m.month}>
              {DONATION_TYPES.map((k) => {
                const v = Number(m.by_type?.[k] ?? 0);
                if (v <= 0) return null;
                const h = (v / max) * plotH;
                cursor -= h;
                return (
                  <rect
                    key={k}
                    x={x}
                    y={cursor}
                    width={barW}
                    height={h}
                    fill={DONATION_COLOUR[k]}
                  >
                    <title>{`${DONATION_LABEL[k]}: ${money(v)}`}</title>
                  </rect>
                );
              })}
              {Number(m.total) > 0 && (
                <text x={x + barW / 2} y={cursor - 5} className="vz-rowvalue num" textAnchor="middle">
                  {short(Number(m.total))}
                </text>
              )}
              <text x={x + barW / 2} y={y0 + plotH + 16} className="vz-tick" textAnchor="middle">
                {months.length > 8 && i % 2 === 1 ? '' : monthLabel(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
