'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { useToast } from './Toast';
import { money } from '@/lib/format';

interface DonorRow {
  id: string;
  name: string;
  contact: string | null;
  monthly_pledge: number;
  is_active: boolean;
  note: string | null;
  donation_id: string | null;
  given: number | null;
  received_on: string | null;
}

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const thisMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * Who gives, and what arrived this month.
 *
 * The pledge is what a donor said they would give; the donation is what came
 * in. Only the donation counts toward the month's fund — a month must never be
 * spent against a promise. A donor with nothing recorded stays in the list with
 * an empty box, so a missing gift is visible rather than absent.
 */
export default function DonorPanel() {
  const toast = useToast();

  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<DonorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Until migration 0010 runs there is no donor_month function; the panel hides
  // itself rather than showing a Postgres error on the budget screen.
  const [available, setAvailable] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [adding, setAdding] = useState(false);
  const [newDonor, setNewDonor] = useState({ name: '', contact: '', monthly_pledge: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/donors?month=${month}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const list = (json.donors ?? []) as DonorRow[];
      setRows(list);
      setDrafts(
        Object.fromEntries(list.map((r) => [r.id, r.given == null ? '' : String(Number(r.given))]))
      );
      setError('');
      setAvailable(true);
    } catch (e) {
      const msg = (e as Error).message || 'Could not load donors.';
      if (/donor_month|schema cache|does not exist|Not Found/i.test(msg)) setAvailable(false);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function record(row: DonorRow) {
    const raw = (drafts[row.id] ?? '').trim();
    const amount = raw === '' ? null : Number(raw);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      toast('Enter a valid amount.', 'bad');
      return;
    }

    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, month, amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(amount ? `${row.name}: ${money(amount)} recorded` : `${row.name}'s donation cleared`);
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(row: DonorRow) {
    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(row.is_active ? `${row.name} marked inactive` : `${row.name} is active again`);
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusyId(null);
    }
  }

  async function add() {
    const name = newDonor.name.trim();
    if (name.length < 2) {
      toast('Enter the donor’s name.', 'bad');
      return;
    }
    setBusyId('new');
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contact: newDonor.contact,
          monthly_pledge: newDonor.monthly_pledge === '' ? 0 : Number(newDonor.monthly_pledge),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`${name} added`);
      setNewDonor({ name: '', contact: '', monthly_pledge: '' });
      setAdding(false);
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusyId(null);
    }
  }

  const total = rows.reduce((s, r) => s + Number(r.given ?? 0), 0);
  const pledged = rows.filter((r) => r.is_active).reduce((s, r) => s + Number(r.monthly_pledge), 0);
  const givenCount = rows.filter((r) => r.given != null).length;

  if (!available) return null;

  return (
    <div className="panel mt-24">
      <div className="panel-head">
        <div>
          <h2>Donors</h2>
          <div className="ph-sub">
            What each donor gave in {monthLabel(month)} — this adds to the month&rsquo;s fund
          </div>
        </div>
        <div className="donor-head-actions">
          <input
            type="month"
            className="input budget-month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : thisMonth())}
            aria-label="Month"
          />
          <button className="admin-btn" type="button" onClick={() => setAdding((a) => !a)}>
            <Icon name={adding ? 'x' : 'plus'} />
            {adding ? 'Cancel' : 'Add donor'}
          </button>
        </div>
      </div>

      {adding && (
        <div className="panel-body donor-add">
          <div className="row-3">
            <div className="field mb-0">
              <label htmlFor="dn_name">Name</label>
              <input
                id="dn_name"
                className="input"
                value={newDonor.name}
                onChange={(e) => setNewDonor({ ...newDonor, name: e.target.value })}
                placeholder="e.g. Hafiz Abdullah"
              />
            </div>
            <div className="field mb-0">
              <label htmlFor="dn_contact">Contact (optional)</label>
              <input
                id="dn_contact"
                className="input"
                dir="ltr"
                value={newDonor.contact}
                onChange={(e) => setNewDonor({ ...newDonor, contact: e.target.value })}
                placeholder="+92 300 1234567"
              />
            </div>
            <div className="field mb-0">
              <label htmlFor="dn_pledge">Monthly pledge (PKR)</label>
              <input
                id="dn_pledge"
                className="input"
                type="number"
                min={0}
                value={newDonor.monthly_pledge}
                onChange={(e) => setNewDonor({ ...newDonor, monthly_pledge: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
          <button
            className="admin-btn mt-16"
            type="button"
            onClick={add}
            disabled={busyId === 'new'}
          >
            {busyId === 'new' ? <span className="spin" /> : <Icon name="check" />}
            Add donor
          </button>
          <p className="field-hint">
            The pledge is what they said they would give. Only what you record below counts toward
            the fund.
          </p>
        </div>
      )}

      {error && (
        <div className="panel-body">
          <p className="err-msg mb-0">{error}</p>
        </div>
      )}

      {!error && loading && (
        <div className="panel-body">
          <span className="sk" style={{ display: 'block', height: 120, borderRadius: 12 }} />
        </div>
      )}

      {!error && !loading && rows.length === 0 && (
        <div className="panel-body">
          <div className="empty">
            <div className="e-ico">
              <Icon name="users" />
            </div>
            <h3>No donors yet</h3>
            <p>Add the people who give each month and record what arrives.</p>
          </div>
        </div>
      )}

      {!error && !loading && rows.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Contact</th>
                  <th>Pledged</th>
                  <th>Given this month</th>
                  <th>Received</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.is_active ? '' : 'row-off'}>
                    <td>
                      <div className="wn">{r.name}</div>
                      {!r.is_active && <div className="we">inactive</div>}
                    </td>
                    <td style={{ color: 'var(--text-faint)', fontSize: 12.5 }} dir="ltr">
                      {r.contact || '—'}
                    </td>
                    <td className="num">{money(Number(r.monthly_pledge), false)}</td>
                    <td>
                      <div className="donor-amount">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={drafts[r.id] ?? ''}
                          placeholder={String(Number(r.monthly_pledge) || 0)}
                          onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })}
                          aria-label={`Amount given by ${r.name}`}
                        />
                        <button
                          className="admin-btn ghost"
                          type="button"
                          onClick={() => record(r)}
                          disabled={busyId === r.id}
                        >
                          {busyId === r.id ? <span className="spin dark" /> : <Icon name="check" />}
                          Save
                        </button>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {r.received_on
                        ? new Date(r.received_on).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })
                        : '—'}
                    </td>
                    <td>
                      <button
                        className="rowlink"
                        type="button"
                        onClick={() => toggle(r)}
                        disabled={busyId === r.id}
                      >
                        {r.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <span>
              <strong className="num">{givenCount}</strong> of{' '}
              <strong className="num">{rows.length}</strong> donors gave this month ·{' '}
              <strong className="num">{money(pledged)}</strong> pledged
            </span>
            <span style={{ fontWeight: 700, color: 'var(--brand-2)' }}>
              {money(total)} added to {monthLabel(month)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
