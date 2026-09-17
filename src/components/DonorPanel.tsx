'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import MemberPicker, { type Candidate } from './MemberPicker';
import Modal from './Modal';
import { useToast } from './Toast';
import { money } from '@/lib/format';
import {
  DONATION_LABEL,
  DONATION_TYPES,
  donationLabel,
  type DonationType,
} from '@/lib/donation-types';

/** One gift. A donor may make several in the same month. */
interface Entry {
  id: string;
  amount: number;
  received_on: string;
  /** Khums, Zakat, Sadaqah… — absent on gifts recorded before migration 0018. */
  donation_type?: string | null;
  note: string | null;
}

interface DonorRow {
  id: string;
  name: string;
  contact: string | null;
  monthly_pledge: number;
  is_active: boolean;
  note: string | null;
  /** The month's total across every gift — null when nothing was given. */
  given: number | null;
  entry_count: number;
  /** The most recent gift's date. */
  received_on: string | null;
  entries: Entry[];
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
 * The pledge is what a donor said they would give; the donations are what came
 * in. Only those count toward the month's fund — a month must never be spent
 * against a promise. A donor with nothing recorded stays in the list with an
 * empty box, so a missing gift is visible rather than absent.
 *
 * A donor may give more than once in a month. The column shows the total,
 * because the total is what the fund is made of; the gifts behind it are
 * listed underneath, and fold away once there are several so that a donor who
 * gives every payday does not push the rest of the table off the screen.
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
  /* Which kind of giving each row is about to record. Per row rather than one
     for the panel: an administrator working down a list is entering a Zakat
     for one donor and a Khums for the next. */
  /* The donor a gift is being recorded against, or null. One at a time: a
     form open on six rows at once is what made this table unreadable. */
  const [recording, setRecording] = useState<DonorRow | null>(null);
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<DonationType | ''>('');
  /* Which donors have their gifts expanded. Kept across a reload so recording
     a second gift does not fold the list you were just looking at. */
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [pledge, setPledge] = useState('');

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

  /**
   * Record a gift.
   *
   * It is added to the month rather than replacing it. This used to overwrite,
   * which meant a donor's second gift silently erased their first and the fund
   * reported less money than had arrived.
   */
  /**
   * Record a gift.
   *
   * It is added to the month rather than replacing it. This used to
   * overwrite, which meant a donor's second gift silently erased their first
   * and the fund reported less money than had arrived.
   */
  async function saveGift() {
    const row = recording;
    if (!row) return;

    const value = Number(amount);
    if (amount.trim() === '' || !Number.isFinite(value) || value <= 0) {
      toast('Enter an amount to record.', 'bad');
      return;
    }
    if (!kind) {
      toast('Choose which kind of donation this is.', 'bad');
      return;
    }

    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, month, amount: value, donation_type: kind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(row.name + ': ' + money(value) + ' ' + donationLabel(kind) + ' recorded');
      setRecording(null);
      setAmount('');
      setKind('');
      // A second gift is worth seeing next to the first.
      setOpenIds((x) => new Set(x).add(row.id));
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusyId(null);
    }
  }
  /** Take one gift back out, leaving the donor's other gifts alone. */
  async function removeGift(row: DonorRow, entry: Entry) {
    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, donation_id: entry.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`${money(Number(entry.amount))} removed from ${row.name}`);
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
    if (!picked) {
      toast('Choose a member first.', 'bad');
      return;
    }
    setBusyId('new');
    try {
      const res = await fetch('/api/admin/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: picked.id,
          monthly_pledge: pledge === '' ? 0 : Number(pledge),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`${picked.full_name} added`);
      setPicked(null);
      setPledge('');
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
              <label>Member</label>
              <MemberPicker value={picked} onPick={setPicked} />
            </div>
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
            Donors are chosen from registered members. The pledge is what they said they would
            give; only what you record below counts toward the fund.
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

      {/*
        Recording a gift, as its own act.

        This was three controls wedged into every row of the table — a select
        whose label did not fit, an input whose placeholder did not fit, and a
        button — repeated down the page beside the figures they were competing
        with. A table is for reading. Recording is a decision, and a decision
        gets a form with room to say what it is asking for.
      */}
      {recording && (
        <Modal
          busy={busyId === recording.id}
          onClose={() => setRecording(null)}
          label={'Record a donation from ' + recording.name}
        >
          <h3>Record a donation</h3>
          <p className="sub">
            From <strong>{recording.name}</strong>, counted toward {monthLabel(month)}.
          </p>

          <div className="field">
            <label htmlFor="gift_amount">Amount (PKR)</label>
            <input
              id="gift_amount"
              className="input"
              type="number"
              min={0}
              inputMode="numeric"
              autoFocus
              value={amount}
              placeholder={String(Number(recording.monthly_pledge) || 0)}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveGift();
                }
              }}
            />
            {Number(recording.monthly_pledge) > 0 && (
              <p className="field-hint">
                They pledge {money(Number(recording.monthly_pledge))} a month.
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="gift_kind">Kind of donation</label>
            <select
              id="gift_kind"
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
              Khums, Zakat and the rest are spent under different rules, so the
              foundation records which one arrived.
            </p>
          </div>

          <div className="amodal-foot">
            <button
              className="admin-btn ghost"
              type="button"
              onClick={() => setRecording(null)}
              disabled={busyId === recording.id}
            >
              Cancel
            </button>
            <button
              className="admin-btn"
              type="button"
              onClick={saveGift}
              disabled={busyId === recording.id}
            >
              {busyId === recording.id ? <span className="spin" /> : <Icon name="check" />}
              Record it
            </button>
          </div>
        </Modal>
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
                {rows.map((r) => {
                  const entries = r.entries ?? [];
                  const open = openIds.has(r.id);
                  return (
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
                        {/* The total and the count share a line. They used to
                            stack, and with the box and the list under them
                            every row stood four items tall — a table of six
                            donors that would not fit on a screen. */}
                        {(Number(r.given ?? 0) > 0 || entries.length > 1) && (
                          <div className="gift-top">
                            {Number(r.given ?? 0) > 0 && (
                              <strong className="gift-total num">
                                {money(Number(r.given), false)}
                              </strong>
                            )}
                            {entries.length > 1 && (
                              <button
                                type="button"
                                className={`gift-toggle ${open ? 'on' : ''}`}
                                aria-expanded={open}
                                onClick={() =>
                                  setOpenIds((s) => {
                                    const next = new Set(s);
                                    if (next.has(r.id)) next.delete(r.id);
                                    else next.add(r.id);
                                    return next;
                                  })
                                }
                              >
                                {entries.length} gifts
                                <Icon name="chevronDown" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Reading only. Recording a gift opens a form: three
                            controls wedged into every row made the table
                            unreadable and clipped their own labels. */}
                        {Number(r.given ?? 0) === 0 && (
                          <span className="gift-none">Nothing yet</span>
                        )}
                        {/* One gift reads fine on its own line. Several fold
                            away, so a donor who gives every week does not
                            stretch the row down the page. */}
                        {entries.length === 1 && (
                          <GiftLine
                            entry={entries[0]}
                            busy={busyId === r.id}
                            onRemove={() => removeGift(r, entries[0])}
                          />
                        )}

                        {entries.length > 1 && open && (
                          <div className="gift-lines">
                            {entries.map((en) => (
                              <GiftLine
                                key={en.id}
                                entry={en}
                                busy={busyId === r.id}
                                onRemove={() => removeGift(r, en)}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                      <td
                        style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}
                      >
                        {r.received_on ? dayLabel(r.received_on) : '—'}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="admin-btn ghost small"
                            type="button"
                            onClick={() => {
                              setRecording(r);
                              setAmount('');
                              setKind('');
                            }}
                            disabled={busyId === r.id}
                          >
                            <Icon name="plus" />
                            Record
                          </button>
                          <button
                            className="rowlink"
                            type="button"
                            onClick={() => toggle(r)}
                            disabled={busyId === r.id}
                          >
                            {r.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

/** One recorded gift: what arrived, when, and a way to take it back out. */
function GiftLine({
  entry,
  busy,
  onRemove,
}: {
  entry: Entry;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="gift-line">
      <strong className="num">{money(Number(entry.amount), false)}</strong>
      <span className="gl-kind">{donationLabel(entry.donation_type)}</span>
      <span className="gl-when">{dayLabel(entry.received_on)}</span>
      {entry.note && <span className="gl-note">{entry.note}</span>}
      <button
        type="button"
        className="gl-x"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${money(Number(entry.amount))} received ${dayLabel(entry.received_on)}`}
        title="Remove this gift"
      >
        <Icon name="x" />
      </button>
    </div>
  );
}
