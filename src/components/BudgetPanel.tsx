'use client';

import { useCallback, useEffect, useState } from 'react';
import Fx, { FxNote } from './Fx';
import { money } from '@/lib/format';

interface BudgetStatus {
  month: string;
  /** What an admin set aside — a reserve, or a one-off gift. */
  budget: number;
  /** Left over from every month before this one — see migration 0017. */
  opening?: number;
  /** What donors actually gave this month. */
  donated: number;
  donors: number;
  /** opening + donated: the money the committee can actually spend. */
  fund: number;
  spent: number;
  transfers: number;
  committed: number;
  remaining: number;
  has_budget: boolean;
}

interface HistoryRow {
  month: string;
  budget: number;
  donated: number;
  fund: number;
  spent: number;
}

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const monthInputValue = (iso: string) => iso.slice(0, 7);

/**
 * What the foundation can give away this month, and what is left after
 * transfers.
 *
 * Both halves are derived, never stored: the fund is the donations recorded for
 * the month, and remaining is that minus the transfers themselves. Nothing here
 * writes — the way to raise the fund is to record a donation below.
 */
export default function BudgetPanel({ compact = false }: { compact?: boolean }) {

  const [month, setMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/budget?month=${month}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatus(json.status);
      setHistory(json.history ?? []);
    } catch (e) {
      setError((e as Error).message || 'Could not load the budget.');
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);


  if (!status) {
    return (
      <div className="panel">
        <div className="panel-body">
          {error ? (
            <p className="muted mb-0">{error}</p>
          ) : (
            <span className="sk" style={{ display: 'block', height: compact ? 90 : 180, borderRadius: 12 }} />
          )}
        </div>
      </div>
    );
  }

  // The month's fund is what was left over plus what donors gave it. A figure
  // somebody typed is still not part of it — that was a promise, and the
  // committee used to spend against it.
  const opening = Number(status.opening ?? 0);
  const fund = Number(status.fund ?? status.donated ?? 0);
  const used = fund > 0 ? Math.min(1, status.spent / fund) : 0;
  const over = status.remaining < 0;
  const tight = !over && fund > 0 && status.remaining < fund * 0.15;

  return (
    <div className="panel budget-panel">
      <div className="panel-head">
        <div>
          <h2>Month&rsquo;s fund</h2>
          <div className="ph-sub">
            {fund > 0
              ? `${monthLabel(status.month)} · ${status.transfers} transfer${status.transfers === 1 ? '' : 's'} so far`
              : `Nothing brought forward or donated yet for ${monthLabel(status.month)}`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="month"
            className="input budget-month"
            value={monthInputValue(month)}
            onChange={(e) => setMonth(`${e.target.value}-01`)}
            aria-label="Budget month"
          />

        </div>
      </div>

      <div className="panel-body">
        <div className="budget-figures">
          {/* Shown only when there is one. A month that genuinely opened at
              zero should not carry a row of zeroes explaining that. */}
          {opening !== 0 && (
            <div className="bf">
              <span className="bf-label">Brought forward</span>
              <span className="bf-value num" style={{ color: 'var(--text-dim)' }}>
                {money(opening)}
              </span>
              <Fx pkr={opening} />
            </div>
          )}
          <div className="bf">
            <span className="bf-label">
              Donations{status.donors > 0 ? ` · ${status.donors}` : ''}
            </span>
            <span className="bf-value num" style={{ color: 'var(--brand-2)' }}>
              {money(Number(status.donated ?? 0))}
            </span>
            <Fx pkr={Number(status.donated ?? 0)} />
          </div>
          <div className="bf">
            <span className="bf-label">Transferred</span>
            <span className="bf-value num" style={{ color: 'var(--st-transfer)' }}>
              −{money(status.spent)}
            </span>
            <Fx pkr={status.spent} />
          </div>
          <div className="bf bf-remaining">
            <span className="bf-label">Remaining</span>
            <span
              className="bf-value num"
              style={{ color: over ? 'var(--danger)' : 'var(--brand-2)' }}
            >
              {money(status.remaining)}
            </span>
            <Fx pkr={status.remaining} />
          </div>
        </div>

        <FxNote />

        <div className="budget-bar" aria-hidden="true">
          <span
            style={{
              width: `${used * 100}%`,
              background: over ? 'var(--danger)' : 'var(--grad-brand)',
            }}
          />
        </div>
        <div className="budget-bar-meta">
          <span>
            {fund > 0
              ? `${Math.round(used * 100)}% of the month used`
              : 'Record a donation below to start the month&rsquo;s fund'}
          </span>
          {status.committed > 0 && (
            <span>{money(status.committed)} approved and awaiting transfer</span>
          )}
        </div>

        {over && (
          <div className="note budget-alert">
            <strong style={{ color: 'var(--danger)' }}>Over the fund.</strong> Transfers have gone
            past what the foundation holds by {money(Math.abs(status.remaining))}, counting what was
            brought forward. Transfers are not blocked — this is a warning, not a limit.
          </div>
        )}
        {tight && (
          <div className="note">
            Only {money(status.remaining)} left this month
            {status.committed > status.remaining
              ? `, and ${money(status.committed)} is already approved and waiting to be paid.`
              : '.'}
          </div>
        )}

        {!compact && history.length > 0 && (
          <div className="vz-table mt-16">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Donations</th>
                  <th>Transferred</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const hFund = Number(h.fund ?? h.donated ?? 0);
                  const rem = hFund - Number(h.spent);
                  return (
                    <tr key={h.month}>
                      <td>{monthLabel(h.month)}</td>
                      <td className="num">{money(hFund, false)}</td>
                      <td className="num">{money(Number(h.spent), false)}</td>
                      <td className="num" style={{ color: rem < 0 ? 'var(--danger)' : undefined }}>
                        {money(rem, false)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
