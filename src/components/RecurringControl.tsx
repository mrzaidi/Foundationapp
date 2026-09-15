'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useToast } from './Toast';
import { dateLabel, money } from '@/lib/format';
import type { RecurringGrant } from '@/lib/types';

/**
 * The standing monthly arrangement, on the admin side.
 *
 * Mostly this exists so it can be stopped. Something that files an application
 * every month with no way to end it would be worse than nothing — a family's
 * circumstances change, and the committee needs a way to say so other than
 * rejecting the same application twelve times.
 */
export default function RecurringControl({ grant }: { grant: RecurringGrant }) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(Number(grant.amount)));

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/recurring', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: grant.id, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not update the arrangement.');
      toast(done);
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="kv">
        <span className="k">Status</span>
        <span className={`badge ${grant.is_active ? 'b-accepted' : 'b-rejected'}`}>
          {grant.is_active ? 'Active' : 'Stopped'}
        </span>
      </div>
      <div className="kv">
        <span className="k">Monthly amount</span>
        <span className="v num">{money(Number(grant.amount))}</span>
      </div>
      <div className="kv">
        <span className="k">Fund</span>
        <span className="v">{grant.fund_types?.name ?? grant.fund_type_id}</span>
      </div>
      <div className="kv">
        <span className="k">Last filed for</span>
        <span className="v">
          {grant.last_generated_on ? dateLabel(grant.last_generated_on) : '—'}
        </span>
      </div>

      {editing ? (
        <div className="field mt-16">
          <label htmlFor={`amt_${grant.id}`}>New monthly amount (PKR)</label>
          <input
            id={`amt_${grant.id}`}
            className="input"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="btn-row mt-8">
            <button
              className="admin-btn ghost"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setEditing(false)}
              disabled={busy}
              type="button"
            >
              Cancel
            </button>
            <button
              className="admin-btn"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => patch({ amount: Number(amount) }, 'Monthly amount updated')}
              disabled={busy}
              type="button"
            >
              {busy ? <span className="spin" /> : <Icon name="check" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="btn-row mt-16">
          <button
            className="admin-btn ghost"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => setEditing(true)}
            disabled={busy}
            type="button"
          >
            <Icon name="settings" />
            Change amount
          </button>
          <button
            className={`admin-btn ${grant.is_active ? 'red' : ''}`}
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() =>
              patch(
                { is_active: !grant.is_active },
                grant.is_active ? 'Monthly arrangement stopped' : 'Monthly arrangement resumed'
              )
            }
            disabled={busy}
            type="button"
          >
            {busy ? (
              <span className="spin" />
            ) : (
              <Icon name={grant.is_active ? 'xCircle' : 'refresh'} />
            )}
            {grant.is_active ? 'Stop' : 'Resume'}
          </button>
        </div>
      )}

      <p className="muted mt-12 mb-0" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
        {grant.is_active
          ? 'On the 1st of each month the system files the next application for this member. It arrives at Requested — the committee still decides every month.'
          : 'Stopped. No further applications will be filed automatically.'}
      </p>
    </>
  );
}
