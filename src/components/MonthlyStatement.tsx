'use client';

import { useRef, useState } from 'react';
import Icon from './Icon';
import { useToast } from './Toast';
import { money } from '@/lib/format';
import { parseAmount, parseCsv } from '@/lib/csv';

interface Outcome {
  key: string;
  amount: number | null;
  action: 'record' | 'clear' | 'unchanged' | 'skip';
  reason?: string;
  donor?: string;
}

interface Summary {
  record: number;
  clear: number;
  unchanged: number;
  skip: number;
  total: number;
}

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const thisMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * Pull the donation rows out of an exported statement.
 *
 * The export is three blocks in one file, so this finds the DONATIONS block,
 * reads its header to locate the columns by name rather than by position — a
 * spreadsheet that has been through Excel rarely comes back column-for-column —
 * and stops at the total line.
 */
function donationRows(text: string): { key: string; amount: number | null; invalid?: boolean }[] {
  const rows = parseCsv(text);
  const startAt = rows.findIndex((r) => /donations received/i.test(r[0] ?? ''));

  // A bare two-column sheet (donor, amount) is accepted too: people build those
  // by hand and it would be rude to refuse them.
  const headerAt = startAt === -1 ? 0 : startAt + 1;
  const header = (rows[headerAt] ?? []).map((h) => h.trim().toLowerCase());

  const emailCol = header.findIndex((h) => h.includes('email'));
  const nameCol = header.findIndex((h) => h.includes('donor') || h.includes('name'));
  const amountCol = header.findIndex((h) => h.includes('amount'));

  const keyCol = emailCol !== -1 ? emailCol : nameCol !== -1 ? nameCol : 0;
  const valCol = amountCol !== -1 ? amountCol : 1;

  const out: { key: string; amount: number | null; invalid?: boolean }[] = [];

  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i];
    const first = (row[0] ?? '').trim();

    // The blocks are separated by a total line and a blank; either ends it.
    if (!row.some((c) => c.trim())) break;
    if (/^transfers made$|^summary$/i.test(first)) break;
    if (row.some((c) => /^total (received|transferred)$/i.test(c.trim()))) break;

    const key = (row[keyCol] ?? '').trim() || first;
    if (!key) continue;

    const rawAmount = (row[valCol] ?? '').trim();
    const amount = rawAmount === '' ? null : parseAmount(rawAmount);
    // An empty cell means "they did not give"; text that is not a number is a
    // typo, and clearing a recorded donation because of one would be theft by
    // spreadsheet. The two are reported differently.
    out.push({ key, amount, invalid: rawAmount !== '' && amount === null });
  }

  return out;
}

/**
 * A month in and out of a spreadsheet.
 *
 * Export is the month as a statement: donations in, transfers out, what is
 * left. Import reads that same file back, so the round trip is fill in the
 * Amount column and send it up — and it always previews before it writes,
 * because these are money figures and a half-applied import is worse than none.
 */
export default function MonthlyStatement({ onImported }: { onImported?: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [month, setMonth] = useState(thisMonth);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<
    { key: string; amount: number | null; invalid?: boolean }[] | null
  >(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [fileName, setFileName] = useState('');

  function reset() {
    setRows(null);
    setOutcomes(null);
    setSummary(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);

    let parsed: { key: string; amount: number | null; invalid?: boolean }[];
    try {
      parsed = donationRows(await file.text());
    } catch {
      toast('Could not read that file — is it a CSV?', 'bad');
      return;
    }

    if (!parsed.length) {
      toast('No donation rows found in that file.', 'bad');
      reset();
      return;
    }

    setRows(parsed);
    await send(parsed, false);
  }

  async function send(
    payload: { key: string; amount: number | null; invalid?: boolean }[],
    apply: boolean
  ) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, rows: payload, apply }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setOutcomes(json.outcomes);
      setSummary(json.summary);

      if (apply) {
        toast(`${json.summary.record + json.summary.clear} row(s) applied to ${monthLabel(month)}`);
        reset();
        onImported?.();
      }
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const willChange = summary ? summary.record + summary.clear : 0;

  return (
    <div className="panel mt-24">
      <div className="panel-head">
        <div>
          <h2>Import &amp; export</h2>
          <div className="ph-sub">
            A month as one spreadsheet — donations in, transfers out, what is left
          </div>
        </div>
        <input
          type="month"
          className="input budget-month"
          value={month.slice(0, 7)}
          onChange={(e) => {
            setMonth(e.target.value ? `${e.target.value}-01` : thisMonth());
            reset();
          }}
          aria-label="Statement month"
        />
      </div>

      <div className="panel-body">
        <div className="stmt-actions">
          <a className="admin-btn" href={`/api/admin/export?month=${month}`} download>
            <Icon name="download" />
            Export {monthLabel(month)}
          </a>

          <label className="admin-btn ghost stmt-import">
            <Icon name="upload" />
            Import donations
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>

          {fileName && (
            <span className="stmt-file" dir="ltr">
              {fileName}
            </span>
          )}
          {busy && <span className="spin dark" />}
        </div>

        <p className="field-hint">
          The exported file is also the import template: fill the <strong>Amount</strong> column in
          the donations block and send it back. Donors are matched on email, or on name if there is
          no email column. Nothing is written until you confirm.
        </p>

        {summary && outcomes && (
          <div className="stmt-preview">
            <div className="stmt-summary">
              <span>
                <strong className="num">{summary.record}</strong> to record
              </span>
              <span>
                <strong className="num">{summary.clear}</strong> to clear
              </span>
              <span>
                <strong className="num">{summary.unchanged}</strong> unchanged
              </span>
              <span className={summary.skip ? 'bad' : ''}>
                <strong className="num">{summary.skip}</strong> skipped
              </span>
              <span className="stmt-total">{money(summary.total)} in new donations</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>From the file</th>
                    <th>Donor</th>
                    <th>Amount</th>
                    <th>What will happen</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o, i) => (
                    <tr key={i} className={o.action === 'skip' ? 'row-off' : ''}>
                      <td dir="ltr">{o.key || '—'}</td>
                      <td>{o.donor ?? '—'}</td>
                      <td className="num">{o.amount == null ? '—' : money(o.amount, false)}</td>
                      <td>
                        {o.action === 'record' && <span className="badge b-accepted">Record</span>}
                        {o.action === 'clear' && <span className="badge b-review">Clear</span>}
                        {o.action === 'unchanged' && (
                          <span style={{ color: 'var(--text-faint)' }}>No change</span>
                        )}
                        {o.action === 'skip' && (
                          <span style={{ color: 'var(--danger)' }}>{o.reason ?? 'Skipped'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="btn-row mt-16">
              <button
                className="admin-btn ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                type="button"
                onClick={reset}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="admin-btn"
                style={{ flex: 1, justifyContent: 'center' }}
                type="button"
                disabled={busy || willChange === 0 || !rows}
                onClick={() => rows && send(rows, true)}
              >
                {busy ? <span className="spin" /> : <Icon name="check" />}
                {willChange === 0
                  ? 'Nothing to apply'
                  : `Apply ${willChange} change${willChange === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
