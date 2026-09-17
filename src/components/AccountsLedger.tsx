'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { money } from '@/lib/format';

interface Entry {
  on_date: string;
  at: string;
  direction: 'in' | 'out';
  party: string;
  kind: string;
  reference: string | null;
  amount: number;
  note: string | null;
  /** The account balance immediately after this movement. */
  balance: number;
}

interface Ledger {
  month: string;
  opening: number;
  received: number;
  paid: number;
  closing: number;
  committed: number;
  entries: Entry[];
}

interface Methods {
  cash: number;
  bank: number;
  unrecorded: number;
  counts: { cash: number; bank: number; unrecorded: number };
  total: number;
  transfers: number;
}

interface MonthRow {
  month: string;
  opening: number;
  received: number;
  paid: number;
}

const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const shortMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const thisMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
};

const nextMonthLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
};

/**
 * The month's book.
 *
 * Four figures across the top, and then every movement that produced them.
 * The running balance is the point of the whole screen: a total nobody can
 * trace is a total nobody trusts, so each line says what the account stood at
 * immediately after it.
 *
 * Nothing here is editable. Money moves by recording a donation or by
 * transferring a grant, and a book that could be written in directly would
 * stop being a record of those things.
 */
export default function AccountsLedger() {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<Ledger | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  /* Cash and bank transfer are not the same act — one is reconciled against a
     tin, the other against a statement — so a month closes with them apart. */
  const [methods, setMethods] = useState<Methods | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  /* One month in detail, or every month in summary. They were stacked on one
     page, which put the month picker and a heading saying the same month side
     by side and then a second table underneath answering a different question. */
  const [view, setView] = useState<'month' | 'history'>('month');
  // Absent until migration 0017 runs; the screen says so rather than showing
  // a Postgres error.
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, monthsRes, methodRes] = await Promise.all([
        fetch(`/api/admin/accounts?month=${month}`),
        fetch('/api/admin/accounts?months=12'),
        fetch(`/api/admin/accounts/methods?month=${month}`),
      ]);

      const ledger = await ledgerRes.json();
      if (!ledgerRes.ok) throw new Error(ledger.error ?? 'Could not load the accounts.');
      setData(ledger as Ledger);

      if (monthsRes.ok) {
        const m = await monthsRes.json();
        setMonths((m.months ?? []) as MonthRow[]);
      }

      setMethods(methodRes.ok ? ((await methodRes.json()) as Methods) : null);

      setError('');
      setAvailable(true);
    } catch (e) {
      const msg = (e as Error).message || 'Could not load the accounts.';
      if (/account_ledger|account_months|schema cache|does not exist|Not Found/i.test(msg))
        setAvailable(false);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!available)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <div className="empty">
            <div className="e-ico">
              <Icon name="book" />
            </div>
            <h3>The accounts are not set up yet</h3>
            <p>
              Migration 0017 has not been applied to the database. Run it in the Supabase SQL
              editor and this screen will fill itself in — there is nothing to enter by hand.
            </p>
          </div>
        </div>
      </div>
    );

  const entries = (data?.entries ?? []).filter((e) => filter === 'all' || e.direction === filter);
  const uncommitted = data ? data.closing - data.committed : 0;

  return (
    <>
      {/* ---- the four figures ---- */}
      <div className="acct-head">
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'month'}
            className={view === 'month' ? 'on' : ''}
            onClick={() => setView('month')}
          >
            Current month
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'history'}
            className={view === 'history' ? 'on' : ''}
            onClick={() => setView('history')}
          >
            Month by month
          </button>
        </div>

        {/* The picker belongs to the month view; in the summary every month
            is already on the screen and choosing one would mean nothing. */}
        {view === 'month' && (
          <input
            type="month"
            className="input budget-month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : thisMonth())}
            aria-label="Month"
          />
        )}

        <a
          className="admin-btn ghost acct-download"
          href={`/api/admin/accounts/export?month=${month}`}
          download
        >
          <Icon name="download" />
          Download for Excel
        </a>
      </div>

      {error && (
        <div className="panel mt-16">
          <div className="panel-body">
            <p className="err-msg mb-0">{error}</p>
          </div>
        </div>
      )}

      {!error && view === 'month' && (
        <div className="acct-cards mt-16">
          <Card
            label="Brought forward"
            hint="Left over from earlier months"
            value={data?.opening ?? 0}
            icon="clock"
            tone="carry"
            loading={loading}
          />
          <Card
            label="Received"
            hint="Donations this month"
            value={data?.received ?? 0}
            icon="trend"
            tone="in"
            loading={loading}
          />
          <Card
            label="Paid out"
            hint="Grants transferred this month"
            value={data?.paid ?? 0}
            icon="wallet"
            tone="out"
            loading={loading}
          />
          <Card
            label="Carries forward"
            hint={`Opens ${nextMonthLabel(month)}`}
            value={data?.closing ?? 0}
            icon="bank"
            tone="closing"
            loading={loading}
          />
        </div>
      )}

      {/*
        The closing balance is not all free to spend: an approved application
        is money already promised. Saying so here stops a committee spending
        the same rupee twice.
      */}
      {!loading && data && data.committed > 0 && view === 'month' && (
        <div className="acct-note mt-16">
          <Icon name="alert" />
          <span>
            <strong>{money(data.committed)}</strong> of this is already approved and waiting to be
            transferred, so <strong>{money(uncommitted)}</strong> is genuinely uncommitted.
          </span>
        </div>
      )}

      {/*
        How the month's grants left the building.

        Cash and a bank transfer are reconciled against different things — a
        tin and a statement — so a treasurer closing the month needs them
        apart. The bar is the split at a glance; the figures under it are what
        actually gets checked.
      */}
      {view === 'month' && !loading && methods && methods.total > 0 && (
        <div className="panel mt-16">
          <div className="panel-head">
            <div>
              <h2>How it was paid</h2>
              <div className="ph-sub">
                {methods.transfers} transfer{methods.transfers === 1 ? '' : 's'} in{' '}
                {monthLabel(month)}
              </div>
            </div>
            <Icon name="wallet" />
          </div>

          <div className="panel-body">
            <div className="paysplit-bar" aria-hidden="true">
              {methods.bank > 0 && (
                <span className="ps-bank" style={{ width: pct(methods.bank, methods.total) }} />
              )}
              {methods.cash > 0 && (
                <span className="ps-cash" style={{ width: pct(methods.cash, methods.total) }} />
              )}
              {methods.unrecorded > 0 && (
                <span
                  className="ps-none"
                  style={{ width: pct(methods.unrecorded, methods.total) }}
                />
              )}
            </div>

            <div className="paysplit">
              <PayFigure
                label="Bank transfer"
                tone="bank"
                amount={methods.bank}
                count={methods.counts.bank}
                total={methods.total}
              />
              <PayFigure
                label="Cash"
                tone="cash"
                amount={methods.cash}
                count={methods.counts.cash}
                total={methods.total}
              />
              {methods.unrecorded > 0 && (
                <PayFigure
                  label="Not recorded"
                  tone="none"
                  amount={methods.unrecorded}
                  count={methods.counts.unrecorded}
                  total={methods.total}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- the ledger ---- */}
      {view === 'month' && (
      <div className="panel mt-16">
        <div className="panel-head">
          <div>
            <h2>Ledger</h2>
            <div className="ph-sub">
              Every movement in {monthLabel(month)}, with the balance after each
            </div>
          </div>
          <div className="chips">
            {(['all', 'in', 'out'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Everything' : f === 'in' ? 'Money in' : 'Money out'}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="panel-body">
            <span className="sk" style={{ display: 'block', height: 160, borderRadius: 12 }} />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="panel-body">
            <div className="empty">
              <div className="e-ico">
                <Icon name="book" />
              </div>
              <h3>Nothing moved in {monthLabel(month)}</h3>
              <p>
                {data && data.opening !== 0
                  ? `The account opened at ${money(data.opening)} and still stands there.`
                  : 'No donations were recorded and no grants were transferred.'}
              </p>
            </div>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="grid acct-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Detail</th>
                  <th className="ta-end">In</th>
                  <th className="ta-end">Out</th>
                  <th className="ta-end">Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* The opening line is not a movement, so it carries no
                    amount — but a book that starts mid-air is unreadable. */}
                {filter === 'all' && data && (
                  <tr className="acct-opening">
                    <td>—</td>
                    <td>
                      <div className="wn">Brought forward</div>
                      <div className="we">Balance at the start of {monthLabel(month)}</div>
                    </td>
                    <td />
                    <td />
                    <td className="num ta-end">{money(data.opening, false)}</td>
                  </tr>
                )}

                {entries.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 12.5 }}>
                      {dayLabel(e.on_date)}
                    </td>
                    <td>
                      <div className="wn">{e.party}</div>
                      <div className="we">
                        {e.kind}
                        {e.reference ? ` · ${e.reference}` : ''}
                        {e.note ? ` · ${e.note}` : ''}
                      </div>
                    </td>
                    <td className="num ta-end acct-in">
                      {e.direction === 'in' ? money(Number(e.amount), false) : ''}
                    </td>
                    <td className="num ta-end acct-out">
                      {e.direction === 'out' ? money(Number(e.amount), false) : ''}
                    </td>
                    <td className="num ta-end">{money(Number(e.balance), false)}</td>
                  </tr>
                ))}
              </tbody>
              {filter === 'all' && data && (
                <tfoot>
                  <tr>
                    <td />
                    <td>
                      <strong>Carried forward to {nextMonthLabel(month)}</strong>
                    </td>
                    <td className="num ta-end acct-in">{money(data.received, false)}</td>
                    <td className="num ta-end acct-out">{money(data.paid, false)}</td>
                    <td className="num ta-end">
                      <strong>{money(data.closing, false)}</strong>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
      )}

      {/* ---- month by month ---- */}
      {view === 'history' && months.length > 0 && (
        <div className="panel mt-16">
          <div className="panel-head">
            <div>
              <h2>Month by month</h2>
              <div className="ph-sub">
                Each month opens with what the one before it left — nothing is reset
              </div>
            </div>
            <Icon name="calendar" />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="grid acct-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="ta-end">Opened with</th>
                  <th className="ta-end">In</th>
                  <th className="ta-end">Out</th>
                  <th className="ta-end">Closed with</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const closing = Number(m.opening) + Number(m.received) - Number(m.paid);
                  return (
                    <tr
                      key={m.month}
                      className={m.month === month ? 'acct-current' : ''}
                      onClick={() => setMonth(m.month)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{shortMonth(m.month)}</td>
                      <td className="num ta-end" style={{ color: 'var(--text-faint)' }}>
                        {money(Number(m.opening), false)}
                      </td>
                      <td className="num ta-end acct-in">{money(Number(m.received), false)}</td>
                      <td className="num ta-end acct-out">{money(Number(m.paid), false)}</td>
                      <td className="num ta-end">
                        <strong>{money(closing, false)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

const pct = (part: number, whole: number) => `${(part / whole) * 100}%`;

/** One payment method: what it came to, and what share of the month it was. */
function PayFigure({
  label,
  tone,
  amount,
  count,
  total,
}: {
  label: string;
  tone: 'bank' | 'cash' | 'none';
  amount: number;
  count: number;
  total: number;
}) {
  return (
    <div className={`payfig ${tone}`}>
      <span className="pf-key">
        <i />
        {label}
      </span>
      <strong className="pf-amount num">{money(amount)}</strong>
      <span className="pf-meta">
        {count} transfer{count === 1 ? '' : 's'} · {Math.round((amount / total) * 100)}%
      </span>
    </div>
  );
}

function Card({
  label,
  hint,
  value,
  icon,
  tone,
  loading,
}: {
  label: string;
  hint: string;
  value: number;
  icon: string;
  tone: 'carry' | 'in' | 'out' | 'closing';
  loading: boolean;
}) {
  return (
    <div className={`acct-card ${tone}`}>
      <span className="ac-ico">
        <Icon name={icon} />
      </span>
      <div className="ac-body">
        <div className="ac-label">{label}</div>
        {loading ? (
          <span className="sk" style={{ display: 'block', height: 22, width: 96, borderRadius: 6 }} />
        ) : (
          <div className="ac-value num">{money(value)}</div>
        )}
        <div className="ac-hint">{hint}</div>
      </div>
    </div>
  );
}
