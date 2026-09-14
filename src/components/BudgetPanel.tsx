'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { useToast } from './Toast';
import { money } from '@/lib/format';

interface BudgetStatus {
  month: string;
  budget: number;
  spent: number;
  transfers: number;
  committed: number;
  remaining: number;
  has_budget: boolean;
}

interface HistoryRow {
  month: string;
  budget: number;
  spent: number;
}

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const monthInputValue = (iso: string) => iso.slice(0, 7);

/**
 * The foundation sets what it can give away this month; every transfer draws
 * that balance down. The remaining figure is computed from the transfers
 * themselves, never stored — so it cannot drift away from what was actually
 * paid out.
 */
export default function BudgetPanel({ compact = false }: { compact?: boolean }) {
  const toast = useToast();

  const [month, setMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/budget?month=${month}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatus(json.status);
      setHistory(json.history ?? []);
      setDraft(json.status?.budget ? String(json.status.budget) : '');
    } catch (e) {
      setError((e as Error).message || 'Could not load the budget.');
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter a budget of zero or more.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, amount, note: note.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`Budget for ${monthLabel(month)} saved`);
      setEditing(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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

  const used = status.budget > 0 ? Math.min(1, status.spent / status.budget) : 0;
  const over = status.remaining < 0;
  const tight = !over && status.budget > 0 && status.remaining < status.budget * 0.15;

  return (
    <div className="panel budget-panel">
      <div className="panel-head">
        <div>
          <h2>Monthly budget</h2>
          <div className="ph-sub">
            {status.has_budget
              ? `${monthLabel(status.month)} · ${status.transfers} transfer${status.transfers === 1 ? '' : 's'} so far`
              : `No budget set for ${monthLabel(status.month)}`}
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
          <button
            className="admin-btn"
            type="button"
            onClick={() => {
              setEditing((v) => !v);
              setError('');
            }}
          >
            <Icon name="budget" />
            {status.has_budget ? 'Change budget' : 'Set budget'}
          </button>
        </div>
      </div>

      <div className="panel-body">
        {editing && (
          <div className="budget-edit">
            <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <label htmlFor="budget-amount">Budget for {monthLabel(month)} (PKR)</label>
              <input
                id="budget-amount"
                className="input"
                type="number"
                min={0}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. 500000"
              />
            </div>
            <div className="field" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}>
              <label htmlFor="budget-note">Note (optional)</label>
              <input
                id="budget-note"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Where the month's funds came from"
              />
            </div>
            <button className="admin-btn" onClick={save} disabled={busy} type="button">
              {busy ? <span className="spin" /> : <Icon name="check" />}
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {error && (
          <p className="err-msg" role="alert">
            {error}
          </p>
        )}

        <div className="budget-figures">
          <div className="bf">
            <span className="bf-label">Budget</span>
            <span className="bf-value num">{money(status.budget)}</span>
          </div>
          <div className="bf">
            <span className="bf-label">Transferred</span>
            <span className="bf-value num" style={{ color: 'var(--st-transfer)' }}>
              −{money(status.spent)}
            </span>
          </div>
          <div className="bf bf-remaining">
            <span className="bf-label">Remaining</span>
            <span
              className="bf-value num"
              style={{ color: over ? 'var(--danger)' : 'var(--brand-2)' }}
            >
              {money(status.remaining)}
            </span>
          </div>
        </div>

        <div className="budget-bar" aria-hidden="true">
          <span
            style={{
              width: `${used * 100}%`,
              background: over ? 'var(--danger)' : 'var(--grad-brand)',
            }}
          />
        </div>
        <div className="budget-bar-meta">
          <span>{status.budget > 0 ? `${Math.round(used * 100)}% of the month used` : 'Set a budget to track spending'}</span>
          {status.committed > 0 && (
            <span>{money(status.committed)} approved and awaiting transfer</span>
          )}
        </div>

        {over && (
          <div className="note budget-alert">
            <strong style={{ color: 'var(--danger)' }}>Over budget.</strong> Transfers this month
            exceed the budget by {money(Math.abs(status.remaining))}. Transfers are not blocked —
            this is a warning, not a limit.
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
                  <th>Budget</th>
                  <th>Transferred</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const rem = Number(h.budget) - Number(h.spent);
                  return (
                    <tr key={h.month}>
                      <td>{monthLabel(h.month)}</td>
                      <td className="num">{money(Number(h.budget), false)}</td>
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
