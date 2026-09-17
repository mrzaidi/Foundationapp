'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';
import { money } from '@/lib/format';
import { DONATION_COLOUR, DONATION_LABEL, asDonationType } from '@/lib/donation-types';

interface Row {
  kind: string;
  received: number;
  paid: number;
  available: number;
}

interface Payload {
  categories: Row[];
  unattributed: number;
  received_total: number;
  paid_total: number;
}

/**
 * What is left of each kind of giving.
 *
 * A foundation holding 60,000 of Zakat and 20,000 of Khums does not hold
 * 80,000 it can spend on anything: each kind is given under its own rules and
 * spent under them too. The single closing balance on the account book is
 * still true, but it is not the whole truth, and a committee about to approve
 * a grant needs to know which pot it can come out of.
 *
 * Cumulative rather than monthly, for the same reason the account book carries
 * forward: Zakat received in September and not spent is still Zakat in
 * October.
 */
export default function CategoryBalances() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  // Absent until migration 0019 runs; the panel stays out of the way rather
  // than showing a Postgres error on the accounts screen.
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/categories');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? 'Could not load the category balances.');
        setData(json as Payload);
        setAvailable(true);
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message || 'Could not load the category balances.';
        if (/category_balances|schema cache|does not exist|Not Found/i.test(msg))
          setAvailable(false);
        else setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  if (error)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <p className="err-msg mb-0">{error}</p>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="panel mt-16">
        <div className="panel-body">
          <p className="muted" style={{ margin: 0 }}>
            Loading the category balances…
          </p>
        </div>
      </div>
    );

  const rows = (data.categories ?? []).filter(
    (r) => Number(r.received) !== 0 || Number(r.paid) !== 0
  );

  return (
    <div className="panel mt-16">
      <div className="panel-head">
        <div>
          <h2>What is left of each fund</h2>
          <div className="ph-sub">
            Received less paid out, all time — each kind is spent under its own rules
          </div>
        </div>
        <Icon name="shield" />
      </div>

      {rows.length === 0 ? (
        <div className="panel-body">
          <p className="muted" style={{ margin: 0 }}>
            Nothing has been received yet, so there is nothing to divide up.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="grid acct-table">
            <thead>
              <tr>
                <th>Fund</th>
                <th className="ta-end">Received</th>
                <th className="ta-end">Paid out</th>
                <th className="ta-end">Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const kind = asDonationType(r.kind);
                const short = Number(r.available) < 0;
                return (
                  <tr key={r.kind}>
                    <td>
                      <span className="type-dot" style={{ background: DONATION_COLOUR[kind] }} />
                      {DONATION_LABEL[kind]}
                    </td>
                    <td className="num ta-end acct-in">{money(Number(r.received), false)}</td>
                    <td className="num ta-end acct-out">
                      {Number(r.paid) ? money(Number(r.paid), false) : ''}
                    </td>
                    <td className="num ta-end">
                      <strong style={{ color: short ? 'var(--danger)' : undefined }}>
                        {money(Number(r.available), false)}
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/*
        Grants paid before anybody was asked which pot they came from. Reported
        rather than spread across the categories: spreading it would be a guess
        presented as a figure, and these are somebody's religious obligations.
      */}
      {Number(data.unattributed) > 0 && (
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <div className="acct-note">
            <Icon name="alert" />
            <span>
              <strong>{money(Number(data.unattributed))}</strong> was transferred before the
              foundation began recording which fund a grant came out of. It is counted in the
              overall balance but against no single fund, because nobody recorded which one it
              was.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
