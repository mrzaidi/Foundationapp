/**
 * Turning an instruction into a proposed change — never into a change.
 *
 * Reading a question wrongly costs a wrong number on a screen. Writing one
 * wrongly costs a donation recorded against the wrong person, or an
 * application approved that nobody approved. So nothing here writes: it
 * produces a proposal, the administrator is shown exactly what will happen in
 * plain words, and only a deliberate confirmation executes it. The model, when
 * one is configured, never touches this path at all — every figure below is
 * lifted from the administrator's own sentence by rule, so there is nothing for
 * it to invent.
 *
 * Marking a request transferred is deliberately not here. That moves money and
 * needs the payment method, the receipt and the fund check that the transfer
 * dialog asks for; a one-line instruction cannot carry them.
 */

import { normalise, rank, type Candidate } from './assistant';

export type ActionKind =
  | 'record_donation'
  | 'clear_donation'
  | 'set_pledge'
  | 'set_status'
  | 'block_member'
  | 'unblock_member';

export interface Action {
  kind: ActionKind;
  /** Resolved row ids — never names, so execution cannot re-interpret them. */
  memberId?: string;
  requestId?: string;
  amount?: number;
  month?: string;
  status?: 'review' | 'accepted' | 'rejected';
  note?: string;
  /** For showing the administrator what they are about to change. */
  subject?: string;
}

/** What the parser found, and what it still needs before it can propose. */
export interface Parsed {
  kind: ActionKind | null;
  amount: number | null;
  reference: string | null;
  /** Everything after the verb that could name a person. */
  needs: string[];
  note: string | null;
}

const WRITE_VERBS: { kind: ActionKind; any: string[] }[] = [
  {
    kind: 'clear_donation',
    any: ['remove the donation', 'delete the donation', 'clear the donation', 'undo the donation'],
  },
  {
    kind: 'record_donation',
    any: [
      'add a donation',
      'add donation',
      'record a donation',
      'record donation',
      'donated',
      'has given',
      'gave us',
      'received from',
      'add payment from',
      'log a donation',
      'put in',
    ],
  },
  { kind: 'set_pledge', any: ['pledge', 'pledged', 'commits to', 'promises'] },
  // Before block, and matched with a leading space: "unblock" contains "block".
  { kind: 'unblock_member', any: [' unblock', ' unsuspend', ' reinstate', ' restore access'] },
  { kind: 'block_member', any: [' block ', ' suspend ', ' bar '] },
  {
    kind: 'set_status',
    any: [
      'approve',
      'accept',
      'reject',
      'decline',
      'turn down',
      'to review',
      'under review',
      'start reviewing',
    ],
  },
];

/** Does this sentence ask for a change at all? */
export function isWrite(question: string): boolean {
  return detectKind(question) !== null;
}

function detectKind(question: string): ActionKind | null {
  const q = normalise(question);

  // A question is not an instruction. "How much did Ali donate?" must never
  // be read as "record a donation from Ali".
  if (/^\s*(how|what|who|when|which|why|is|are|do|does|did|can|show|list|tell)\b/.test(q.trim()))
    return null;
  if (q.includes('?')) return null;

  for (const v of WRITE_VERBS) if (v.any.some((w) => q.includes(w))) return v.kind;
  return null;
}

/**
 * Amounts as they are actually written here: 5000, 5,000, PKR 5000, 5k,
 * 2 lakh. Years and application references are removed first so neither is
 * read as money.
 */
export function amountFrom(question: string): number | null {
  const cleaned = question
    .replace(/\bSHF[-\s]?\d{2}[-\s]?\d{1,6}\b/gi, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/,/g, '');

  const m = cleaned.match(/\b(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore|m|million)?\b/i);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  switch ((m[2] ?? '').toLowerCase()) {
    case 'k':
    case 'thousand':
      return n * 1_000;
    case 'lakh':
    case 'lac':
      return n * 100_000;
    case 'crore':
      return n * 10_000_000;
    case 'm':
    case 'million':
      return n * 1_000_000;
    default:
      return n;
  }
}

/** The status an instruction is asking for. */
export function statusFrom(question: string): 'review' | 'accepted' | 'rejected' | null {
  const q = normalise(question);
  if (/\breject|declin|turn(ed)? down/.test(q)) return 'rejected';
  if (/\bapprove|accept/.test(q)) return 'accepted';
  if (/\breview/.test(q)) return 'review';
  return null;
}

/**
 * A rejection has to say why — the member is shown the reason, and "rejected"
 * with no explanation is the thing that makes people give up on applying.
 */
export function noteFrom(question: string): string | null {
  const m = question.match(/\b(?:because|reason|since|as)\b[:,\s]+(.{3,200})$/i);
  return m ? m[1].trim().replace(/[.\s]+$/, '') : null;
}

export function parse(question: string): Parsed {
  return {
    kind: detectKind(question),
    amount: amountFrom(question),
    reference: null,
    needs: [],
    note: noteFrom(question),
  };
}

/** Shown when an instruction is understood but incomplete. */
export const WRITE_EXAMPLES = [
  'Aiman donated 5000',
  'Approve SHF-26-01001 at 5000',
  'Reject SHF-26-01002 because the documents are incomplete',
  'Block Zaidi',
];

/** Re-exported so the route resolves names the same way reads do. */
export { rank };
export type { Candidate };
