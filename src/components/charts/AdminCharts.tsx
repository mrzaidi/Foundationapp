'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import { money } from '@/lib/format';
import {
  BAR_MAX,
  GAP,
  Gridlines,
  Legend,
  axisTicks,
  barPath,
  barPathH,
  niceMax,
  short,
} from './primitives';
import {
  type AnalyticsRow,
  type Granularity,
  buildBuckets,
  bucketIndex,
  num,
} from './buckets';

/* ---------------------------------------------------------------------------
   Palette — validated with the data-viz checker (light surface).
   Stages: ALL CHECKS PASS, worst adjacent CVD ΔE 9.1.
   Yellow and aqua sit under 3:1 on the surface, so every chart here ships
   visible labels and a table view — that is the required relief, not optional.
   --------------------------------------------------------------------------- */
const STAGES = [
  { key: 'requested', color: '#2a78d6' },
  { key: 'review', color: '#eda100' },
  { key: 'accepted', color: '#1baf7a' },
  { key: 'transferred', color: '#4a3aa7' },
] as const;

const REJECTED = '#d03b3b';
const MONEY_SERIES = { requested: '#2a78d6', disbursed: '#1baf7a' };
/** Fund demand is one measure, so it gets one hue — magnitude, not identity. */
const MAGNITUDE = '#0e9d63';

type StageKey = (typeof STAGES)[number]['key'];

interface FundRow {
  id: string;
  name: string;
}

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
];

const STAGE_LABEL: Record<string, string> = {
  requested: 'Requested',
  review: 'Review',
  accepted: 'Accepted',
  transferred: 'Transferred',
  rejected: 'Rejected',
};

export default function AdminCharts() {
  const [rows, setRows] = useState<AnalyticsRow[] | null>(null);
  const [funds, setFunds] = useState<FundRow[]>([]);
  const [g, setG] = useState<Granularity>('week');
  const [table, setTable] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/analytics?days=400')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Could not load analytics.');
        return j;
      })
      .then((j) => {
        setRows(j.rows);
        setFunds(j.funds);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const buckets = useMemo(() => buildBuckets(g), [g]);

  /* ---- bucket the rows once, reuse for both time charts ---- */
  const series = useMemo(() => {
    const counts = buckets.map(() => ({
      requested: 0,
      review: 0,
      accepted: 0,
      transferred: 0,
      rejected: 0,
    }));
    const amounts = buckets.map(() => ({ requested: 0, disbursed: 0 }));

    for (const r of rows ?? []) {
      const i = bucketIndex(buckets, r.created_at);
      if (i >= 0) {
        const s = r.status as keyof (typeof counts)[number];
        if (s in counts[i]) counts[i][s] += 1;
        amounts[i].requested += num(r.amount_requested);
      }
      // money actually leaving the foundation is dated by the transfer
      if (r.transferred_at) {
        const t = bucketIndex(buckets, r.transferred_at);
        if (t >= 0) amounts[t].disbursed += num(r.amount_approved ?? r.amount_requested);
      }
    }

    return { counts, amounts };
  }, [rows, buckets]);

  if (error) {
    return (
      <div className="panel">
        <div className="panel-body">
          <p className="muted mb-0">{error}</p>
        </div>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Trends</h2>
            <div className="ph-sub">Loading analytics…</div>
          </div>
        </div>
        <div className="panel-body">
          <span className="sk" style={{ display: 'block', height: 240, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="vz-root">
      {/* ---- one filter row above the charts ---- */}
      <div className="vz-toolbar">
        <div className="vz-seg" role="group" aria-label="Group by">
          {GRANULARITIES.map((x) => (
            <button
              key={x.key}
              type="button"
              className={g === x.key ? 'on' : ''}
              aria-pressed={g === x.key}
              onClick={() => setG(x.key)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <span className="vz-range">
          {buckets[0].title} – {buckets[buckets.length - 1].title}
        </span>
        <button
          type="button"
          className={`vz-tablebtn ${table ? 'on' : ''}`}
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
        >
          <Icon name="list" />
          {table ? 'Hide table' : 'Table view'}
        </button>
      </div>

      <div className="vz-grid-2">
        <ApplicationsOverTime
          buckets={buckets}
          counts={series.counts}
          granularity={g}
          table={table}
        />
        <MoneyOverTime buckets={buckets} amounts={series.amounts} table={table} />
      </div>
    </div>
  );
}

/* ===========================================================================
   1. Applications over time — stacked columns by stage
   =========================================================================== */
function ApplicationsOverTime({
  buckets,
  counts,
  granularity,
  table,
}: {
  buckets: ReturnType<typeof buildBuckets>;
  counts: Record<string, number>[];
  granularity: Granularity;
  table: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 250;
  const pad = { t: 12, r: 12, b: 30, l: 40 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const totals = counts.map((c) => STAGES.reduce((s, st) => s + (c[st.key] ?? 0), 0) + (c.rejected ?? 0));
  const max = niceMax(Math.max(...totals, 1));
  const ticks = axisTicks(max);

  const band = plotW / buckets.length;
  const barW = Math.min(BAR_MAX, band - 10);
  const grand = totals.reduce((a, b) => a + b, 0);

  const allStages = [...STAGES, { key: 'rejected' as const, color: REJECTED }];

  // every other label when days are dense, so ticks never collide
  const labelEvery = granularity === 'day' && buckets.length > 10 ? 2 : 1;

  return (
    <figure className="vz-card">
      <figcaption>
        <h3>Applications received</h3>
        <p>How many arrived in each period, split by where they stand now</p>
      </figcaption>

      {grand === 0 ? (
        <p className="vz-empty">No applications in this period.</p>
      ) : (
        <>
          <div className="vz-plot">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Applications received per period">
              <Gridlines ticks={ticks} max={max} plotW={plotW} plotH={plotH} x0={pad.l} y0={pad.t} />

              {buckets.map((b, i) => {
                const x = pad.l + band * i + (band - barW) / 2;
                let cursor = pad.t + plotH;

                return (
                  <g
                    key={b.key}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {/* hit target wider than the mark */}
                    <rect
                      x={pad.l + band * i}
                      y={pad.t}
                      width={band}
                      height={plotH}
                      fill="transparent"
                    />
                    {allStages.map((st) => {
                      const v = counts[i][st.key] ?? 0;
                      if (!v) return null;
                      const h = (v / max) * plotH - GAP;
                      if (h <= 0) return null;
                      cursor -= h + GAP;
                      const isTop =
                        allStages
                          .slice(allStages.indexOf(st) + 1)
                          .every((later) => !counts[i][later.key]);
                      return (
                        <path
                          key={st.key}
                          d={
                            isTop
                              ? barPath(x, cursor, barW, h)
                              : `M${x},${cursor} h${barW} v${h} h${-barW} Z`
                          }
                          fill={st.color}
                          opacity={hover === null || hover === i ? 1 : 0.35}
                        />
                      );
                    })}
                    <text
                      x={pad.l + band * i + band / 2}
                      y={H - 10}
                      className="vz-tick"
                      textAnchor="middle"
                      opacity={i % labelEvery === 0 ? 1 : 0}
                    >
                      {b.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hover !== null && totals[hover] > 0 && (
              <div
                className="vz-tip"
                style={{ left: `${((hover + 0.5) / buckets.length) * 100}%` }}
              >
                <div className="vz-tip-head">{buckets[hover].title}</div>
                {allStages.map((st) =>
                  counts[hover][st.key] ? (
                    <div className="vz-tip-row" key={st.key}>
                      <span className="vz-swatch" style={{ background: st.color }} />
                      <span>{STAGE_LABEL[st.key]}</span>
                      <b className="num">{counts[hover][st.key]}</b>
                    </div>
                  ) : null
                )}
                <div className="vz-tip-total">
                  <span>Total</span>
                  <b className="num">{totals[hover]}</b>
                </div>
              </div>
            )}
          </div>

          <Legend
            items={allStages.map((st) => ({
              label: STAGE_LABEL[st.key],
              color: st.color,
              value: String(counts.reduce((s, c) => s + (c[st.key] ?? 0), 0)),
            }))}
          />

          {table && (
            <TableView
              head={['Period', ...allStages.map((s) => STAGE_LABEL[s.key]), 'Total']}
              rows={buckets.map((b, i) => [
                b.title,
                ...allStages.map((s) => String(counts[i][s.key] ?? 0)),
                String(totals[i]),
              ])}
            />
          )}
        </>
      )}
    </figure>
  );
}

/* ===========================================================================
   2. Requested vs disbursed — grouped columns, one shared axis (both PKR)
   =========================================================================== */
function MoneyOverTime({
  buckets,
  amounts,
  table,
}: {
  buckets: ReturnType<typeof buildBuckets>;
  amounts: { requested: number; disbursed: number }[];
  table: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 250;
  const pad = { t: 12, r: 12, b: 30, l: 44 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const max = niceMax(Math.max(...amounts.flatMap((a) => [a.requested, a.disbursed]), 1));
  const ticks = axisTicks(max);

  const band = plotW / buckets.length;
  const pairW = Math.min(BAR_MAX * 2 + GAP, band - 10);
  const barW = (pairW - GAP) / 2;

  const totalReq = amounts.reduce((s, a) => s + a.requested, 0);
  const totalDis = amounts.reduce((s, a) => s + a.disbursed, 0);

  return (
    <figure className="vz-card">
      <figcaption>
        <h3>Requested vs transferred</h3>
        <p>Both in PKR on one scale — requested when it was applied for, transferred when it was paid</p>
      </figcaption>

      {totalReq === 0 && totalDis === 0 ? (
        <p className="vz-empty">No amounts in this period.</p>
      ) : (
        <>
          <div className="vz-plot">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Requested versus transferred amounts">
              <Gridlines ticks={ticks} max={max} plotW={plotW} plotH={plotH} x0={pad.l} y0={pad.t} />

              {buckets.map((b, i) => {
                const x0 = pad.l + band * i + (band - pairW) / 2;
                const hR = (amounts[i].requested / max) * plotH;
                const hD = (amounts[i].disbursed / max) * plotH;
                const dim = hover !== null && hover !== i ? 0.35 : 1;

                return (
                  <g key={b.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                    <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="transparent" />
                    <path
                      d={barPath(x0, pad.t + plotH - hR, barW, hR)}
                      fill={MONEY_SERIES.requested}
                      opacity={dim}
                    />
                    <path
                      d={barPath(x0 + barW + GAP, pad.t + plotH - hD, barW, hD)}
                      fill={MONEY_SERIES.disbursed}
                      opacity={dim}
                    />
                    <text
                      x={pad.l + band * i + band / 2}
                      y={H - 10}
                      className="vz-tick"
                      textAnchor="middle"
                    >
                      {b.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hover !== null && (
              <div className="vz-tip" style={{ left: `${((hover + 0.5) / buckets.length) * 100}%` }}>
                <div className="vz-tip-head">{buckets[hover].title}</div>
                <div className="vz-tip-row">
                  <span className="vz-swatch" style={{ background: MONEY_SERIES.requested }} />
                  <span>Requested</span>
                  <b className="num">{money(amounts[hover].requested, false)}</b>
                </div>
                <div className="vz-tip-row">
                  <span className="vz-swatch" style={{ background: MONEY_SERIES.disbursed }} />
                  <span>Transferred</span>
                  <b className="num">{money(amounts[hover].disbursed, false)}</b>
                </div>
              </div>
            )}
          </div>

          <Legend
            items={[
              { label: 'Requested', color: MONEY_SERIES.requested, value: short(totalReq) },
              { label: 'Transferred', color: MONEY_SERIES.disbursed, value: short(totalDis) },
            ]}
          />

          {table && (
            <TableView
              head={['Period', 'Requested', 'Transferred']}
              rows={buckets.map((b, i) => [
                b.title,
                money(amounts[i].requested, false),
                money(amounts[i].disbursed, false),
              ])}
            />
          )}
        </>
      )}
    </figure>
  );
}

function TableView({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="vz-table">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? '' : 'num'}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
