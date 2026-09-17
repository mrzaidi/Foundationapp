'use client';
import {
  DONATION_LABEL,
  DONATION_TYPES,
  type DonationType,
} from '@/lib/donation-types';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Fx from './Fx';
import Modal from './Modal';
import { useToast } from './Toast';
import { createClient } from '@/lib/supabase/client';
import { STATUS_LABEL, bytes, money } from '@/lib/format';
import type { FundRequest, RequestStatus } from '@/lib/types';

type Action = 'review' | 'accepted' | 'transferred' | 'rejected';

const MAX_RECEIPTS = 4;

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
    sub: 'Record that the money has been sent. Attach the receipt so the member can see proof of the transfer on their own screen.',
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
  const [payment, setPayment] = useState<'cash' | 'bank'>(request.payment_method ?? 'bank');
  /* Which kind of giving this grant comes out of, and what is left of each. */
  const [fundedFrom, setFundedFrom] = useState<DonationType | ''>('');
  const [balances, setBalances] = useState<Record<string, number> | null>(null);
  const [receipts, setReceipts] = useState<File[]>([]);
  // What is left in this month's fund. Null until it loads, so the button is
  // never disabled on a figure nobody has yet.
  const [remaining, setRemaining] = useState<number | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);

  const status = request.status;

  // Only when the transfer dialog is actually open: the committee's balance is
  // not something every request row needs to fetch.
  useEffect(() => {
    if (open !== 'transferred') return;
    let cancelled = false;
    (async () => {
      try {
        const [b, c] = await Promise.all([
          fetch('/api/admin/budget'),
          fetch('/api/admin/categories'),
        ]);
        const json = await b.json();
        if (!cancelled && b.ok) setRemaining(Number(json.status?.remaining ?? 0));
        if (c.ok) {
          const cats = await c.json();
          if (!cancelled)
            setBalances(
              Object.fromEntries(
                (cats.categories ?? []).map((x: { kind: string; available: number }) => [
                  x.kind,
                  Number(x.available),
                ])
              )
            );
        }
      } catch {
        // leave it unknown; the server still refuses an overspend
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function addReceipts(list: FileList | null) {
    if (!list?.length) return;

    const room = MAX_RECEIPTS - receipts.length;
    const incoming = Array.from(list).filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast(`${file.name} is larger than 10 MB.`, 'bad');
        return false;
      }
      return true;
    });

    if (incoming.length > room) toast(`You can attach at most ${MAX_RECEIPTS} receipts.`, 'bad');
    setReceipts((prev) => [...prev, ...incoming.slice(0, room)]);
  }

  /**
   * The receipt goes up before the status moves.
   *
   * If the upload fails the application stays where it was and the admin can
   * try again — better than a request marked transferred with its evidence
   * missing and nothing on screen to say so.
   */
  async function uploadReceipts(): Promise<boolean> {
    if (!receipts.length) return true;

    const supabase = createClient();
    const uploaded: { path: string; file_name: string; mime_type: string; size_bytes: number }[] =
      [];

    for (const file of receipts) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      // The member's folder, not the admin's: this is evidence for them, and
      // filing it there is what lets them open it without a new read policy.
      const path = `${request.user_id}/requests/${request.id}/receipt-${Date.now()}-${safe}`;

      const { error } = await supabase.storage
        .from('documents')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        toast(`Could not upload ${file.name}: ${error.message}`, 'bad');
        return false;
      }
      uploaded.push({ path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
    }

    const res = await fetch(`/api/requests/${request.id}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: uploaded, kind: 'receipt' }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast(json.error ?? 'Could not record the receipt.', 'bad');
      return false;
    }
    return true;
  }

  async function apply(action: Action) {
    // Checked before anything is uploaded or written: a receipt filed against
    // a transfer that is then refused leaves evidence of a payment that did
    // not happen.
    if (action === 'transferred' && !fundedFrom) {
      toast('Choose which fund this is paid out of.', 'bad');
      return;
    }

    setBusy(true);
    try {
      if (action === 'transferred' && !(await uploadReceipts())) {
        setBusy(false);
        return;
      }

      const body: Record<string, unknown> = { status: action, admin_note: note.trim() || null };
      if (action === 'accepted' || action === 'transferred') body.amount_approved = Number(amount);
      if (action === 'transferred') {
        body.transfer_ref = transferRef.trim() || null;
        body.payment_method = payment;
        body.funded_from = fundedFrom;
      }

      const res = await fetch(`/api/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Update failed.');

      toast(`Marked as ${STATUS_LABEL[action as RequestStatus].toLowerCase()}`);
      setReceipts([]);
      setOpen(null);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setReceipts([]);
    setOpen(null);
  }

  // A transfer cannot exceed what donors gave. The server and a database
  // trigger both refuse it; this just stops the admin finding out the hard way.
  const wanted = Number(amount);
  const overFund =
    open === 'transferred' &&
    remaining !== null &&
    Number.isFinite(wanted) &&
    wanted > remaining;

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
          <>
            <div className="note">
              This application is {STATUS_LABEL[status].toLowerCase()} — no further action is needed.
            </div>

            {/* The money has moved, so there is a receipt to hand over. */}
            {status === 'transferred' && (
              <a
                className="admin-btn plum"
                style={{ justifyContent: 'center', width: '100%', marginTop: 10 }}
                href={`/api/admin/requests/${request.id}/invoice`}
                download={`receipt-${request.reference}.pdf`}
              >
                <Icon name="download" />
                Generate invoice (PDF)
              </a>
            )}
          </>
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
        <Modal
          busy={busy}
          onClose={close}
          /* Only the transfer dialog carries enough fields to need the room. */
          className={open === 'transferred' ? 'roomy' : ''}
          label={ACTION_COPY[open].title}
        >
          <h3>{ACTION_COPY[open].title}</h3>
          <p className="sub">{ACTION_COPY[open].sub}</p>

          <div className="form-grid">

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

              {open === 'transferred' && remaining !== null && (
                <div className={`fundbar ${overFund ? 'short' : ''}`}>
                  <span>{overFund ? 'Not enough in the fund' : 'Left in this month’s fund'}</span>
                  <strong className="num">{money(remaining)}</strong>
                  <Fx pkr={remaining} />
                </div>
              )}
            </div>
          )}

          {open === 'transferred' && (
            <>
              {/*
                Which pot the money comes out of.
              
                A foundation holding Zakat and Khums does not hold one sum it
                can spend on anything — each kind of giving is spent under its
                own rules. Asking here, once, is the only moment anybody knows
                the answer; afterwards the money has gone and nothing records
                where it came from.
              */}
              <div className="field">
                <label htmlFor="funded_from">Paid out of which fund?</label>
                <select
                  id="funded_from"
                  className="input"
                  value={fundedFrom}
                  onChange={(e) => setFundedFrom(e.target.value as DonationType)}
                >
                  <option value="" disabled>
                    Choose a fund…
                  </option>
                  {DONATION_TYPES.map((k) => (
                    <option key={k} value={k}>
                      {DONATION_LABEL[k]}
                      {balances ? ` — ${money(balances[k] ?? 0)} available` : ''}
                    </option>
                  ))}
                </select>
                {!fundedFrom && (
                  <p className="field-hint">
                    Required. Khums, Zakat and the rest are spent under different
                    rules, so the foundation records which one a grant came out of.
                  </p>
                )}
                {balances && fundedFrom && (
                  <p
                    className="field-hint"
                    style={{
                      color:
                        (balances[fundedFrom] ?? 0) < Number(amount)
                          ? 'var(--danger)'
                          : undefined,
                    }}
                  >
                    {(balances[fundedFrom] ?? 0) < Number(amount)
                      ? `Only ${money(balances[fundedFrom] ?? 0)} of ${DONATION_LABEL[fundedFrom]} is left — this would take it below zero.`
                      : `${money(balances[fundedFrom] ?? 0)} of ${DONATION_LABEL[fundedFrom]} is available.`}
                  </p>
                )}
              </div>

              <div className="field">
                <label>How was it paid?</label>
                <div className="paychoice">
                  {(
                    [
                      { k: 'bank', l: 'Bank transfer', i: 'bank' },
                      { k: 'cash', l: 'Cash', i: 'wallet' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.k}
                      type="button"
                      className={`paybtn ${payment === p.k ? 'on' : ''}`}
                      onClick={() => setPayment(p.k)}
                      aria-pressed={payment === p.k}
                    >
                      <Icon name={p.i} />
                      {p.l}
                    </button>
                  ))}
                </div>
                <p className="err-msg" style={{ color: 'var(--text-faint)', fontWeight: 500 }}>
                  This appears on the receipt the member is given.
                </p>
              </div>

              {/* Cash has no reference to quote, so it is not asked for. */}
              {payment === 'bank' && (
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

              <div className="field span-2">
                <label htmlFor="receipt">
                  Transfer receipt{' '}
                  <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>(optional)</span>
                  {receipts.length > 0 && (
                    <span className="file-count num">
                      {receipts.length}/{MAX_RECEIPTS}
                    </span>
                  )}
                </label>

                <label className="upload small" htmlFor="receipt">
                  <div className="u-ico">
                    <Icon name={receipts.length ? 'checkCircle' : 'upload'} />
                  </div>
                  <div className="u-t">
                    {receipts.length ? 'Add another receipt' : 'Upload the transfer receipt'}
                  </div>
                  <div className="u-d">
                    Screenshot or PDF — up to {MAX_RECEIPTS} files, 10 MB each. The member sees
                    this on their application.
                  </div>
                  <input
                    id="receipt"
                    ref={receiptInput}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      addReceipts(e.target.files);
                      if (receiptInput.current) receiptInput.current.value = '';
                    }}
                  />
                </label>

                {receipts.length > 0 && (
                  <div className="filelist">
                    {receipts.map((file, i) => (
                      <div className="fileitem" key={`${file.name}-${i}`}>
                        <div className="fi">
                          <Icon name={file.type.startsWith('image/') ? 'image' : 'file'} />
                        </div>
                        <div className="fmid">
                          <div className="fn" dir="ltr">
                            {file.name}
                          </div>
                          <div className="fs">{bytes(file.size)}</div>
                        </div>
                        <button
                          type="button"
                          className="rm"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => setReceipts((p) => p.filter((_, x) => x !== i))}
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="field span-2">
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

          <div className="btn-row mt-8 span-2">
            <button
              className="admin-btn ghost"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={close}
              disabled={busy}
              type="button"
            >
              Cancel
            </button>
            <button
              className={`admin-btn ${ACTION_COPY[open].cls}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => apply(open)}
              disabled={busy || overFund || (open === 'rejected' && !note.trim())}
              type="button"
            >
              {busy ? <span className="spin" /> : <Icon name={ACTION_COPY[open].icon} />}
              {busy ? 'Saving…' : overFund ? 'Fund is short' : ACTION_COPY[open].cta}
            </button>
          </div>
          </div>
        </Modal>
      )}
    </>
  );
}
