'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { useToast } from './Toast';
import { money } from '@/lib/format';
import {
  DONATION_COLOUR,
  DONATION_LABEL,
  DONATION_TYPES,
  asDonationType,
  type DonationType,
} from '@/lib/donation-types';
import { EmptyPlot, barPath, niceMax, short } from './charts/primitives';

interface Gift {
  id: string;
  amount: number;
  donation_type: string | null;
  received_on: string;
  month: string;
  note: string | null;
}

interface MonthPoint {
  month: string;
  total: number;
}

interface Detail {
  donor: {
    id: string;
    name: string;
    contact: string | null;
    email: string | null;
    city: string | null;
    country: string | null;
    age: number | null;
    gender: string | null;
    monthly_pledge: number;
    is_active: boolean;
    note: string | null;
    since: string;
  };
  donations: Gift[];
  months: MonthPoint[];
  totals: {
    all_time: number;
    gifts: number;
    by_type: { kind: string; total: number }[];
  };
}

const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });

const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const monthOf = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const thisMonthIso = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * One donor, in full.
 *
 * The list answers "who gives and how much this month". This answers the
 * question somebody has when they click a name: who is this person, what have
 * they given over the whole time they have been giving, of which kind, and
 * when — with the receipt for any one of them a tap away.
 */
export default function DonorDetail({ id }: { id: string }) {
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /* Recording a gift lives here now, beside the history it joins. */
  const [recording, setRecording] = useState(false);
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<DonationType | ''>('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/donors/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not load this donor.');
      setData(json as Detail);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function record() {
    const value = Number(amount);
    if (amount.trim() === '' || !Number.isFinite(value) || value <= 0)
      return toast('Enter an amount to record.', 'bad');
    if (!kind) return toast('Choose which kind of donation this is.', 'bad');

    setBusy(true);
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          month: thisMonthIso(),
          amount: value,
          donation_type: kind,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`${money(value)} ${DONATION_LABEL[kind]} recorded`);
      setRecording(false);
      setAmount('');
      setKind('');
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function remove(gift: Gift) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, donation_id: gift.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`${money(Number(gift.amount))} removed`);
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <p className="err-msg mb-0">{error}</p>
          <Link className="rowlink" href="/admin/donors">
            Back to donors
          </Link>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <p className="muted" style={{ margin: 0 }}>
            Loading this donor…
          </p>
        </div>
      </div>
    );

  const { donor, donations, months, totals } = data;

  return (
    <>
      {/* ---- basic info ---- */}
      <div className="panel mt-16">
        <div className="panel-head">
          <div>
            <h2>{donor.name}</h2>
            <div className="ph-sub">
              {donor.is_active ? 'Active donor' : 'Inactive'} · giving since{' '}
              {fullDate(donor.since)}
            </div>
          </div>
          <button
            className="admin-btn"
            type="button"
            onClick={() => {
              setRecording(true);
              setAmount('');
              setKind('');
            }}
          >
            <Icon name="plus" />
            Record a donation
          </button>
        </div>

        <div className="panel-body">
          <div className="dd-facts">
            <Fact label="Contact" value={donor.contact || '—'} ltr />
            <Fact label="Email" value={donor.email || '—'} ltr />
            <Fact
              label="Lives in"
              value={[donor.city, donor.country].filter(Boolean).join(', ') || '—'}
            />
            <Fact
              label="Age"
              value={donor.age ? `${donor.age}${donor.gender ? ` · ${donor.gender}` : ''}` : '—'}
            />
            <Fact label="Monthly pledge" value={money(Number(donor.monthly_pledge))} />
            <Fact label="Given in total" value={money(Number(totals.all_time))} strong />
            <Fact
              label="Gifts"
              value={`${totals.gifts} donation${totals.gifts === 1 ? '' : 's'}`}
            />
          </div>

          {donor.note && <p className="field-hint" style={{ marginTop: 14 }}>{donor.note}</p>}

          {/* What they give, by kind — the split matters because each is spent
              under different rules. */}
          {totals.by_type.length > 0 && (
            <div className="dd-kinds">
              {totals.by_type.map((t) => {
                const k = asDonationType(t.kind);
                return (
                  <span key={t.kind} className="dd-kind">
                    <i style={{ background: DONATION_COLOUR[k] }} />
                    {DONATION_LABEL[k]}
                    <strong className="num">{money(Number(t.total), false)}</strong>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ---- month by month ---- */}
      <div className="panel mt-16">
        <div className="panel-head">
          <div>
            <h2>Given by month</h2>
            <div className="ph-sub">The last twelve months, including the quiet ones</div>
          </div>
          <Icon name="trend" />
        </div>
        <div className="panel-body">
          <MonthlyBars months={months} />
        </div>
      </div>

      {/* ---- every gift ---- */}
      <div className="panel mt-16">
        <div className="panel-head">
          <div>
            <h2>Every donation</h2>
            <div className="ph-sub">Newest first, with a receipt for each</div>
          </div>
        </div>

        {donations.length === 0 ? (
          <div className="panel-body">
            <div className="empty">
              <div className="e-ico">
                <Icon name="heart" />
              </div>
              <h3>Nothing recorded yet</h3>
              <p>When {donor.name.split(' ')[0]} gives, it will be listed here.</p>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="grid acct-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Kind</th>
                  <th>Counted toward</th>
                  <th className="ta-end">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {donations.map((g) => {
                  const k = asDonationType(g.donation_type);
                  return (
                    <tr key={g.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fullDate(g.received_on)}</td>
                      <td>
                        <span className="type-dot" style={{ background: DONATION_COLOUR[k] }} />
                        {DONATION_LABEL[k]}
                      </td>
                      <td style={{ color: 'var(--text-faint)' }}>{monthOf(g.month)}</td>
                      <td className="num ta-end">{money(Number(g.amount), false)}</td>
                      <td>
                        <div className="row-actions">
                          <a
                            className="rowlink"
                            href={`/api/admin/donations/${g.id}/receipt`}
                            download
                          >
                            Receipt
                          </a>
                          <button
                            className="rowlink"
                            type="button"
                            onClick={() => remove(g)}
                            disabled={busy}
                            style={{ color: 'var(--danger)' }}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- recording a gift ---- */}
      {recording && (
        <div className="amodal-back" onClick={busy ? undefined : () => setRecording(false)}>
          <div className="amodal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Record a donation</h3>
            <p className="sub">
              From <strong>{donor.name}</strong>, counted toward {monthOf(thisMonthIso())}.
            </p>

            <div className="field">
              <label htmlFor="dd_amount">Amount (PKR)</label>
              <input
                id="dd_amount"
                className="input"
                type="number"
                min={0}
                inputMode="numeric"
                autoFocus
                value={amount}
                placeholder={String(Number(donor.monthly_pledge) || 0)}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void record();
                  }
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="dd_kind">Kind of donation</label>
              <select
                id="dd_kind"
                className="input"
                value={kind}
                onChange={(e) => setKind(e.target.value as DonationType)}
              >
                <option value="" disabled>
                  Choose a kind…
                </option>
                {DONATION_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {DONATION_LABEL[k]}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                Khums, Zakat and the rest are spent under different rules, so the foundation
                records which one arrived.
              </p>
            </div>

            <div className="amodal-foot">
              <button
                className="admin-btn ghost"
                type="button"
                onClick={() => setRecording(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="admin-btn" type="button" onClick={record} disabled={busy}>
                {busy ? <span className="spin" /> : <Icon name="check" />}
                Record it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Fact({
  label,
  value,
  strong,
  ltr,
}: {
  label: string;
  value: string;
  strong?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className="dd-fact">
      <span className="dd-k">{label}</span>
      <span className={`dd-v ${strong ? 'big num' : ''}`} dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}

/** Twelve months of giving, empty ones included — a gap is worth seeing. */
function MonthlyBars({ months }: { months: MonthPoint[] }) {
  const W = 640;
  const H = 200;
  const x0 = 10;
  const y0 = 12;
  const plotW = W - x0 - 12;
  const plotH = H - y0 - 28;

  const values = months.map((m) => Number(m.total));
  if (!values.some((v) => v > 0)) return <EmptyPlot label="Nothing given in the last year." />;

  const max = niceMax(Math.max(1, ...values));
  const step = plotW / Math.max(1, months.length);
  const barW = Math.min(34, step * 0.6);

  return (
    <div className="vz-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Given by month">
        {months.map((m, i) => {
          const v = Number(m.total);
          const h = (v / max) * plotH;
          const x = x0 + i * step + (step - barW) / 2;
          const y = y0 + plotH - h;
          return (
            <g key={m.month}>
              {h > 0 && <path d={barPath(x, y, barW, h)} fill="#1baf7a" />}
              {v > 0 && (
                <text x={x + barW / 2} y={y - 5} className="vz-rowvalue num" textAnchor="middle">
                  {short(v)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={y0 + plotH + 16}
                className="vz-tick"
                textAnchor="middle"
              >
                {monthLabel(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
