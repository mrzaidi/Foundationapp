'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useToast } from './Toast';
import { STATUS_LABEL, money } from '@/lib/format';
import type { FundRequest, RequestStatus } from '@/lib/types';

type Action = 'review' | 'accepted' | 'transferred' | 'rejected';

const ACTION_COPY: Record<
  Action,
  { title: string; sub: string; cta: string; icon: string; cls: string }
> = {
  review: {
    title: 'Move to review',
    sub: 'Marks the application as being checked by the committee. The member sees the tracker advance.',
    cta: 'Move to review',
    icon: 'search',
    cls: 'gold',
  },
  accepted: {
    title: 'Approve this application',
    sub: 'Confirm the amount the foundation will pay. This can differ from what the member requested.',
    cta: 'Approve',
    icon: 'checkCircle',
    cls: '',
  },
  transferred: {
    title: 'Mark as transferred',
    sub: 'Record that the money has been sent. Add the bank or wallet reference for the audit trail.',
    cta: 'Confirm transfer',
    icon: 'wallet',
    cls: 'plum',
  },
  rejected: {
    title: 'Reject this application',
    sub: 'The member will see that the application was not approved, along with your note.',
    cta: 'Reject application',
    icon: 'xCircle',
    cls: 'red',
  },
};

export default function RequestActions({ request }: { request: FundRequest }) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(
    String(request.amount_approved ?? request.amount_requested)
  );
  const [note, setNote] = useState(request.admin_note ?? '');
  const [transferRef, setTransferRef] = useState(request.transfer_ref ?? '');

  const status = request.status;

  async function apply(action: Action) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { status: action, admin_note: note.trim() || null };
      if (action === 'accepted' || action === 'transferred') body.amount_approved = Number(amount);
      if (action === 'transferred') body.transfer_ref = transferRef.trim() || null;

      const res = await fetch(`/api/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Update failed.');

      toast(`Marked as ${STATUS_LABEL[action as RequestStatus].toLowerCase()}`);
      setOpen(null);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  /** Which buttons make sense from the current status. */
  const available: Action[] =
    status === 'requested'
      ? ['review', 'accepted', 'rejected']
      : status === 'review'
        ? ['accepted', 'rejected']
        : status === 'accepted'
          ? ['transferred', 'rejected']
          : [];

  return (
    <>
      <div className="admin-actions">
        {available.length === 0 ? (
          <div className="note">
            This application is {STATUS_LABEL[status].toLowerCase()} — no further action is needed.
          </div>
        ) : (
          available.map((a) => (
            <button
              key={a}
              className={`admin-btn ${ACTION_COPY[a].cls}`}
              style={{ justifyContent: 'center', width: '100%' }}
              onClick={() => setOpen(a)}
              type="button"
            >
              <Icon name={ACTION_COPY[a].icon} />
              {ACTION_COPY[a].cta}
            </button>
          ))
        )}
      </div>

      {open && (
        <div className="amodal-back" onClick={busy ? undefined : () => setOpen(null)}>
          <div className="amodal" onClick={(e) => e.stopPropagation()}>
            <h3>{ACTION_COPY[open].title}</h3>
            <p className="sub">{ACTION_COPY[open].sub}</p>

            {(open === 'accepted' || open === 'transferred') && (
              <div className="field">
                <label htmlFor="approved">Approved amount (PKR)</label>
                <input
                  id="approved"
                  className="input"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="err-msg" style={{ color: 'var(--text-faint)', fontWeight: 500 }}>
                  Member requested {money(Number(request.amount_requested))}
                </p>
              </div>
            )}

            {open === 'transferred' && (
              <div className="field">
                <label htmlFor="tref">Transfer reference</label>
                <input
                  id="tref"
                  className="input"
                  value={transferRef}
                  onChange={(e) => setTransferRef(e.target.value)}
                  placeholder="Bank / Easypaisa / JazzCash reference"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="note">
                Note to the member {open === 'rejected' && <span className="req-star">*</span>}
              </label>
              <textarea
                id="note"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  open === 'rejected'
                    ? 'Explain why this application could not be approved…'
                    : 'Optional note shown on the member&apos;s application screen'
                }
              />
            </div>

            <div className="btn-row mt-8">
              <button
                className="admin-btn ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setOpen(null)}
                disabled={busy}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`admin-btn ${ACTION_COPY[open].cls}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => apply(open)}
                disabled={busy || (open === 'rejected' && !note.trim())}
                type="button"
              >
                {busy ? <span className="spin" /> : <Icon name={ACTION_COPY[open].icon} />}
                {busy ? 'Saving…' : ACTION_COPY[open].cta}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
