'use client';

import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { money } from '@/lib/format';
import { EmptyPlot, Gridlines, axisTicks, barPath, barPathH, niceMax, short } from './primitives';

interface History {
  months: { month: string; total: number; donors: number }[];
  donors: { name: string; total: number; gifts: number }[];
  recipients: { name: string; total: number; grants: number }[];
}

/* One measure, one hue: these are magnitudes, not identities, so a single
   colour with a value label beats a rainbow nobody can map back to a name. */
const IN = '#1baf7a';
const OUT = '#4a3aa7';

const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

const yearOf = (iso: string) => iso.slice(2, 4);

/**
 * Giving and receiving, drawn.
 *
 * Three questions a committee asks of a year at once — what came in each
 * month, who gave it, and who it reached. Every chart ships its figures as
 * text beside the bars, because two of the three are about people and a bar
 * nobody can put a number to is decoration.
 */
export default function DonorCharts() {
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState('');
  const [months, setMonths] = useState(12);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');

    (async () => {
      try {
        const res = await fetch(`/api/admin/donors/history?months=${months}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? 'Could not load the history.');
        setData(json as History);
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
      <div className="panel mt-24">
        <div className="panel-body">
          <p className="err-msg">{error}</p>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="panel mt-24">
        <div className="panel-body">
          <p className="muted" style={{ margin: 0 }}>
            Loading the donation history…
          </p>
        </div>
      </div>
    );

  const anyGiving = data.months.some((m) => m.total > 0);

  /* ---- monthly bars ----
     Narrower than it was: all three charts share one row now, so this one
     lives in a third of the width rather than the whole of it. */
  const W = 420;
  const H = 250;
  const x0 = 42;
  const y0 = 12;
  const plotW = W - x0 - 10;
  const plotH = H - y0 - 34;
  const max = niceMax(Math.max(1, ...data.months.map((m) => m.total)));
  const ticks = axisTicks(max);
  const step = plotW / Math.max(1, data.months.length);
  const barW = Math.min(26, step * 0.6);

  return (
    <div className="donor-charts mt-24">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Donations by month</h2>
            <div className="ph-sub">What the fund was given, month by month</div>
          </div>
          <div className="chips">
            {[6, 12, 24].map((n) => (
              <button
                key={n}
                type="button"
                className={`chip ${months === n ? 'active' : ''}`}
                onClick={() => setMonths(n)}
              >
                {n} months
              </button>
            ))}
          </div>
        </div>

        <div className="panel-body">
          {!anyGiving ? (
            <EmptyPlot label="No donations recorded in this period." />
          ) : (
            <div className="vz-plot">
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Donations by month">
                <Gridlines ticks={ticks} max={max} plotW={plotW} plotH={plotH} x0={x0} y0={y0} />
                {data.months.map((m, i) => {
                  const h = max === 0 ? 0 : (m.total / max) * plotH;
                  const x = x0 + i * step + (step - barW) / 2;
                  const y = y0 + plotH - h;
                  return (
                    <g key={m.month}>
                      {h > 0 && <path d={barPath(x, y, barW, h)} fill={IN} />}
                      {m.total > 0 && (
                        <text x={x + barW / 2} y={y - 5} className="vz-rowvalue num" textAnchor="middle">
                          {short(m.total)}
                        </text>
                      )}
                      <text
                        x={x + barW / 2}
                        y={y0 + plotH + 16}
                        className="vz-tick"
                        textAnchor="middle"
                      >
                        {data.months.length > 8 && i % 2 === 1 ? '' : monthLabel(m.month)}
                      </text>
                      {(i === 0 || m.month.slice(5, 7) === '01') && (
                        <text
                          x={x + barW / 2}
                          y={y0 + plotH + 27}
                          className="vz-tick"
                          textAnchor="middle"
                          opacity="0.7"
                        >
                          &apos;{yearOf(m.month)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {/* The numbers themselves, because a bar is not a record. */}
          {anyGiving && (
            <details className="vz-table">
              <summary>See the figures</summary>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Donations</th>
                    <th className="num">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td>
                        {monthLabel(m.month)} 20{yearOf(m.month)}
                      </td>
                      <td className="num">{m.donors}</td>
                      <td className="num">{money(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      </div>


        <RankPanel
          title="Who gave the most"
          sub={`Across the last ${months} months`}
          icon="heart"
          colour={IN}
          rows={data.donors.map((d) => ({
            name: d.name,
            total: d.total,
            meta: `${d.gifts} ${d.gifts === 1 ? 'donation' : 'donations'}`,
          }))}
          empty="No donations recorded in this period."
        />
        <RankPanel
          title="Who received the most"
          sub={`Across the last ${months} months`}
          icon="wallet"
          colour={OUT}
          rows={data.recipients.map((r) => ({
            name: r.name,
            total: r.total,
            meta: `${r.grants} ${r.grants === 1 ? 'grant' : 'grants'}`,
          }))}
          empty="Nothing has been transferred in this period."
        />
    </div>
  );
}

/** A ranked list of people and amounts, drawn as bars they can be read from. */
function RankPanel({
  title,
  sub,
  icon,
  colour,
  rows,
  empty,
}: {
  title: string;
  sub: string;
  icon: string;
  colour: string;
  rows: { name: string; total: number; meta: string }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  const W = 340;
  const rowH = 34;
  const labelW = 120;

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
        {rows.length === 0 ? (
          <EmptyPlot label={empty} />
        ) : (
          <div className="vz-plot">
            <svg viewBox={`0 0 ${W} ${rows.length * rowH + 8}`} role="img" aria-label={title}>
              {rows.map((r, i) => {
                const w = (r.total / max) * (W - labelW - 66);
                const y = i * rowH + 4;
                return (
                  <g key={r.name}>
                    <text x={0} y={y + 18} className="vz-tick">
                      {r.name.length > 16 ? `${r.name.slice(0, 15)}…` : r.name}
                    </text>
                    <path d={barPathH(labelW, y + 7, Math.max(2, w), 15)} fill={colour} />
                    <text x={labelW + Math.max(2, w) + 6} y={y + 18} className="vz-rowvalue num">
                      {short(r.total)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {rows.length > 0 && (
          <details className="vz-table">
            <summary>See the figures</summary>
            <table className="grid">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td style={{ color: 'var(--text-faint)', fontSize: 12 }}>{r.meta}</td>
                    <td className="num">{money(r.total)}</td>
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
