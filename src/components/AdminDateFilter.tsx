'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from './Icon';

/** Pakistan does not observe daylight saving, so a fixed offset is exact. */
const PK_OFFSET = 5 * 60; // minutes

/** `YYYY-MM-DD` for a moment, read in Pakistan time. */
function pkDate(d: Date): string {
  const shifted = new Date(d.getTime() + PK_OFFSET * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  return pkDate(new Date(Date.now() - n * 86_400_000));
}

function monthStart(): string {
  const today = pkDate(new Date());
  return `${today.slice(0, 7)}-01`;
}

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: 'Today', from: () => daysAgo(0), to: () => daysAgo(0) },
  { label: 'Last 7 days', from: () => daysAgo(6), to: () => daysAgo(0) },
  { label: 'Last 30 days', from: () => daysAgo(29), to: () => daysAgo(0) },
  { label: 'This month', from: monthStart, to: () => daysAgo(0) },
];

/**
 * Date range over when an application was submitted.
 *
 * Ranges are inclusive at both ends and read in Pakistan time — "1st to 5th"
 * should mean the whole of the 5th to the person typing it, not up to midnight
 * UTC, which in Karachi is five in the morning.
 */
export default function AdminDateFilter({ basePath }: { basePath: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [error, setError] = useState('');

  const active = Boolean(params.get('from') || params.get('to'));

  function push(nextFrom: string, nextTo: string) {
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setError('The start date is after the end date.');
      return;
    }
    setError('');

    const p = new URLSearchParams(params.toString());
    nextFrom ? p.set('from', nextFrom) : p.delete('from');
    nextTo ? p.set('to', nextTo) : p.delete('to');
    p.delete('page'); // a new range means a new first page

    const s = p.toString();
    router.push(`${basePath}${s ? `?${s}` : ''}`);
  }

  function preset(p: (typeof PRESETS)[number]) {
    const f = p.from();
    const t = p.to();
    setFrom(f);
    setTo(t);
    push(f, t);
  }

  function clear() {
    setFrom('');
    setTo('');
    push('', '');
  }

  return (
    <div className="datefilter">
      <div className="df-row">
        <span className="df-label">
          <Icon name="calendar" />
          Submitted
        </span>

        <label className="df-input">
          <span>From</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Submitted from"
          />
        </label>

        <label className="df-input">
          <span>To</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Submitted to"
          />
        </label>

        <button className="admin-btn ghost" type="button" onClick={() => push(from, to)}>
          <Icon name="filter" />
          Apply
        </button>

        {active && (
          <button className="admin-btn ghost" type="button" onClick={clear}>
            <Icon name="x" />
            Clear
          </button>
        )}
      </div>

      <div className="chips df-presets">
        {PRESETS.map((p) => {
          const on = params.get('from') === p.from() && params.get('to') === p.to();
          return (
            <button
              key={p.label}
              type="button"
              className={`chip ${on ? 'active' : ''}`}
              onClick={() => preset(p)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="err-msg" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
