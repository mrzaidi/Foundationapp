/**
 * The smallest CSV that survives Excel.
 *
 * No dependency: the only hard parts are quoting and the BOM, and both are a
 * few lines. Everything the foundation exports is names, amounts and dates —
 * names contain commas, so quoting is not optional.
 */

/** Quote a cell only when it would otherwise break the row. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  // CRLF and a UTF-8 BOM: without the BOM Excel reads Urdu names as mojibake,
  // which is the whole file ruined for the person who has to read it.
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Parse a CSV into rows of strings.
 *
 * Handles quoted fields, escaped quotes and either line ending. Anything more
 * exotic than that is not a spreadsheet export, and guessing would be worse
 * than refusing.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];

    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Trailing blank lines are noise, not empty records.
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** Amounts arrive as "12,000", "PKR 12000" or " 12000 ". All mean the same. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
