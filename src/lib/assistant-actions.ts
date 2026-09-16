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
  | 'set_donor_active'
  | 'set_pledge'
  | 'set_status'
  | 'block_member'
  | 'unblock_member'
  | 'create_member';

export interface Action {
  kind: ActionKind;
  /** Resolved row ids — never names, so execution cannot re-interpret them. */
  memberId?: string;
  requestId?: string;
  amount?: number;
  month?: string;
  status?: 'review' | 'accepted' | 'rejected';
  /** For set_donor_active: whether they stay on the donor list. */
  active?: boolean;
  note?: string;
  /** For showing the administrator what they are about to change. */
  subject?: string;
  /** Collected over several turns by a guided instruction — see assistant-flows. */
  member?: {
    full_name: string;
    gender: string;
    age: number;
    city: string;
    country: string;
    email: string;
    mobile: string;
    password: string;
  };
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

/*
 * Matched as separate words, not as fixed phrases. "Add 5000 donation for
 * Aiman" and "record a donation of 5000 from Aiman" are the same instruction,
 * and an administrator should not have to learn which wording the software
 * happens to know.
 */
const ADD = /\b(add|added|adding|record|recorded|log|logged|enter|entered|put|receiv\w*|collect\w*|got|take|taken)\b/;
const EDIT = /\b(update|updated|change|changed|set|edit|correct|amend|revise|make)\b/;
const REMOVE = /\b(remove|removed|delete|deleted|clear|cleared|cancel|cancelled|undo|reverse)\b/;

const GIVING = /\b(donation|donations|donated|donate|donor|gave|given|giving|contribution|contributed|payment|paid in|amount)\b/;
const PLEDGE = /\b(pledge|pledged|pledges|commits?|committed|promise[sd]?)\b/;

/* Taking somebody off the donor list, or putting them back on it. One pair of
   patterns, used both to recognise the instruction and to read its direction,
   so the two can never disagree about what a sentence meant. */
const DONOR_OFF = /\b(deactivate|disable|inactive|retire|drop|stop|suspend|off)\b|\bno longer\b|\bremove\b/;
const DONOR_ON = /\b(activate|reactivate|enable|restore)\b|\badd back\b|\bput back\b|\bback on\b/;

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
  if (question.includes('?')) return null;

  /*
   * Anything naming the donor list is about the donor list, and is settled
   * first. "Deactivate X as a donor" and "block X" are different enough that
   * the word donor has to win before the blocking rule sees "suspend", and
   * before "remove" is read as removing a donation.
   */
  if (/\bdonors?\b/.test(q) && (DONOR_ON.test(q) || DONOR_OFF.test(q))) return 'set_donor_active';

  // Checked before blocking: "unblock" contains "block".
  if (/\b(unblock|unsuspend|reinstate)\b|\brestore access\b/.test(q)) return 'unblock_member';
  if (/\b(block|suspend|bar)\b/.test(q)) return 'block_member';

  if (/\b(approve|approved|accept|accepted|reject|rejected|decline|declined)\b|\bturn(ed)? down\b|\bto review\b|\bunder review\b/.test(q))
    return 'set_status';

  if (PLEDGE.test(q)) return 'set_pledge';

  if (REMOVE.test(q) && GIVING.test(q)) return 'clear_donation';
  if ((ADD.test(q) || EDIT.test(q)) && GIVING.test(q)) return 'record_donation';

  // "Aiman donated 5000" — the verb alone is the instruction.
  if (/\b(donated|gave|contributed)\b/.test(q)) return 'record_donation';

  // "Record 2 lakh from Zaidi" never says the word donation, and money coming
  // in is the only thing it could mean. Without a name it asks for one rather
  // than assuming, so a loose reading costs a question, not a wrong write.
  if (ADD.test(q) && amountFrom(question) !== null) return 'record_donation';

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

/**
 * Whether a donor instruction is switching them on or off. Deactivating is the
 * default reading: "as a donor" on its own is almost always somebody being
 * taken off the list, and the confirmation says which way it is going anyway.
 */
export function donorActiveFrom(question: string): boolean {
  const q = normalise(question);
  // Activation is read first: "reactivate" carries no off-word, while
  // "deactivate" contains "activate" and would otherwise read as switching on.
  if (DONOR_ON.test(q) && !DONOR_OFF.test(q)) return true;
  return false;
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
