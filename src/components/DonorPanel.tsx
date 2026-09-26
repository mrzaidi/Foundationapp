'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { useToast } from './Toast';
import { money } from '@/lib/format';

interface DonorRow {
  id: string;
  name: string;
  contact: string | null;
  monthly_pledge: number;
  is_active: boolean;
  /** The month's total across every gift — null when nothing was given. */
  given: number | null;
  entry_count: number;
  /** The most recent gift's date. */
  received_on: string | null;
}

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const thisMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * Who gives, and what arrived this month.
 *
 * A list, and only a list. It used to carry each donor's whole giving history
 * inside one of its cells — every gift with its kind, its date, its receipt
 * and a remove button — which made a page of records try to be a page of
 * detail at the same time and did neither well. All of that lives on the
 * donor's own page now; this answers "who gave, and how much" and hands over.
 *
 * The pledge is what a donor said they would give; the donation is what came
 * in. Only what came in counts toward the month's fund — a month must never be
 * spent against a promise — so a donor with nothing recorded stays in the list
 * saying so, rather than quietly disappearing from it.
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
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [pledge, setPledge] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/donors?month=${month}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRows((json.donors ?? []) as DonorRow[]);
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

  async function add() {
    if (name.trim().length < 2) {
      toast('Enter the donor’s name.', 'bad');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contact: contact.trim(),
          email: email.trim(),
          city: city.trim(),
          note: note.trim(),
          monthly_pledge: pledge === '' ? 0 : Number(pledge),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`${name.trim()} added`);
      setName('');
      setContact('');
      setEmail('');
      setCity('');
      setPledge('');
      setNote('');
      setAdding(false);
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const total = rows.reduce((s, r) => s + Number(r.given ?? 0), 0);
  const pledged = rows.filter((r) => r.is_active).reduce((s, r) => s + Number(r.monthly_pledge), 0);
  const givenCount = rows.filter((r) => Number(r.given ?? 0) > 0).length;
  const giftCount = rows.reduce((s, r) => s + (r.entry_count ?? 0), 0);

  if (!available) return null;

  return (
    <div className="panel mt-24">
      <div className="panel-head">
        <div>
          <h2>Donors</h2>
          <div className="ph-sub">
            What each donor gave in {monthLabel(month)} — this is the month&rsquo;s fund
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
          <div className="donor-add-row">
            <div className="field mb-0">
              <label htmlFor="dn_name">
                Donor&rsquo;s name <span className="req-star">*</span>
              </label>
              <input
                id="dn_name"
                className="input"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The name to thank, and to put on the receipt"
              />
            </div>
            <div className="field mb-0">
              <label htmlFor="dn_contact">Contact number</label>
              <input
                id="dn_contact"
                className="input"
                dir="ltr"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="03xx xxxxxxx"
              />
            </div>
          </div>

          <div className="donor-add-row mt-16">
            <div className="field mb-0">
              <label htmlFor="dn_email">Email</label>
              <input
                id="dn_email"
                className="input"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Where the receipt goes"
              />
            </div>
            <div className="field mb-0">
              <label htmlFor="dn_city">City</label>
              <input
                id="dn_city"
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Karachi, Dubai, London…"
              />
            </div>
          </div>

          <div className="donor-add-row mt-16">
            <div className="field mb-0">
              <label htmlFor="dn_pledge">Monthly pledge (PKR)</label>
              <input
                id="dn_pledge"
                className="input"
                type="number"
                min={0}
                value={pledge}
                onChange={(e) => setPledge(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="field mb-0">
              <label htmlFor="dn_note">Note</label>
              <input
                id="dn_note"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything the office should remember"
              />
            </div>
          </div>

          <button className="admin-btn mt-16" type="button" onClick={add} disabled={busy}>
            {busy ? <span className="spin" /> : <Icon name="check" />}
            Add donor
          </button>
          <p className="field-hint">
            A donor is their own record — they do not need a member account, and most will never
            have one. The pledge is what they said they would give; only what is actually
            recorded against them counts toward the month&rsquo;s fund.
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
            <p>
              Add the members who give each month and record what arrives — that is what the
              month&rsquo;s fund is made of.
            </p>
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
                  <th>Last received</th>
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
                      {Number(r.given ?? 0) > 0 ? (
                        <span className="gift-top">
                          <strong className="gift-total num">
                            {money(Number(r.given), false)}
                          </strong>
                          {r.entry_count > 1 && (
                            <span className="gift-count">{r.entry_count} gifts</span>
                          )}
                        </span>
                      ) : (
                        <span className="gift-none">Nothing yet</span>
                      )}
                    </td>
                    <td
                      style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}
                    >
                      {r.received_on ? dayLabel(r.received_on) : '—'}
                    </td>
                    <td>
                      {/* One way in. Recording a gift, the list of gifts, their
                          receipts and the remove button all live on the donor's
                          own page, where there is room for them. */}
                      <Link className="admin-btn ghost small" href={`/admin/donors/${r.id}`}>
                        View
                        <Icon name="chevronRight" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <span>
              <strong className="num">{givenCount}</strong> of{' '}
              <strong className="num">{rows.length}</strong> donors gave this month
              {giftCount > givenCount && (
                <>
                  {' '}
                  in <strong className="num">{giftCount}</strong> gifts
                </>
              )}{' '}
              · <strong className="num">{money(pledged)}</strong> pledged
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
