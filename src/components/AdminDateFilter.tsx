'use client';

import { useEffect, useRef, useState } from 'react';
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

        <DateField label="Start date" value={from} max={to || undefined} onChange={setFrom} />
        <DateField label="End date" value={to} min={from || undefined} onChange={setTo} />

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

/**
 * A date field that says what it is for while it is empty.
 *
 * An empty <input type="date"> prints its own format — mm/dd/yyyy — which is
 * the browser's idea of a date order, not the reader's: staff in Lahore were
 * being shown the American one, and it said nothing about which end of the
 * range they were filling in.
 *
 * Hiding that text with ::-webkit-datetime-edit does not work reliably; the
 * format stays visible underneath whatever is drawn over it. So while the
 * field is empty and unfocused it is simply a text input with a real
 * placeholder, and it becomes a date input — with the picker — the moment it
 * is touched. The moment there is a date, the browser's display returns, so
 * nobody is left guessing how what they chose was understood.
 */
function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const asDate = touched || Boolean(value);

  /*
   * Changing the input type re-renders it, which drops the focus that caused
   * the change — so the first click would land on a text box and open
   * nothing. Focus is put back and the picker asked for directly, so one click
   * does what one click looks like it should.
   */
  useEffect(() => {
    if (!touched || !ref.current) return;
    const el = ref.current;
    el.focus();
    try {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Some browsers refuse showPicker outside a user gesture; the field is
      // still a working date input, which is the part that matters.
    }
  }, [touched]);

  return (
    <label className="df-input">
      <input
        ref={ref}
        type={asDate ? 'date' : 'text'}
        value={value}
        min={min}
        max={max}
        placeholder={label}
        aria-label={label}
        onFocus={() => setTouched(true)}
        onBlur={() => setTouched(false)}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
