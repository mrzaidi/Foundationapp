'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useToast } from './Toast';
import { money } from '@/lib/format';

/**
 * The amount asked for, correctable until it is paid.
 *
 * Applications are often filled in at the office on somebody's behalf, so a
 * mistyped figure is the committee's mistake rather than the member's to live
 * with. Approving at a different amount was always possible, but that records
 * a decision — not a correction — and leaves the wrong request on file.
 *
 * Only while the application is undecided. Once money has moved the record has
 * to match the receipt that went out with it, so the control disappears.
 */
export default function RequestedAmount({
  id,
  amount,
  editable,
}: {
  id: string;
  amount: number;
  editable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(amount));
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      toast('Enter a valid amount.', 'bad');
      return;
    }
    if (n === amount) {
      setEditing(false);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_requested: n }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not update the amount.');

      toast(`Requested amount corrected to ${money(n)}`);
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (!editing)
    return (
      <span className="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {money(amount)}
        {editable && (
          <button
            type="button"
            className="amt-edit"
            onClick={() => {
              setValue(String(amount));
              setEditing(true);
            }}
            aria-label="Correct the requested amount"
          >
            <Icon name="settings" />
          </button>
        )}
      </span>
    );

  return (
    <span className="v amt-editing">
      <input
        className="input"
        type="number"
        min={1}
        value={value}
        autoFocus
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button type="button" className="admin-btn" disabled={busy} onClick={save}>
        {busy ? <span className="spin" /> : <Icon name="check" />}
      </button>
      <button
        type="button"
        className="admin-btn ghost"
        disabled={busy}
        onClick={() => setEditing(false)}
      >
        <Icon name="x" />
      </button>
    </span>
  );
}
