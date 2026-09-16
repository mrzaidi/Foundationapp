/**
 * Instructions that need more than one sentence.
 *
 * "Aiman donated 5000" carries everything needed in one go. "Add a new member"
 * does not — it needs a name, an age, a city, an email, a number. Rather than
 * refuse it, or make somebody type a paragraph in the right order, the
 * assistant asks for one thing at a time and remembers the answers.
 *
 * The state lives in the conversation rather than on the server: each reply
 * carries what has been collected so far, and the next request sends it back.
 * Nothing is half-written to the database while a flow is in progress — the
 * whole thing is still a proposal until the last field is in and the
 * administrator confirms it, exactly like the one-line instructions.
 */

import { normalise } from './assistant';
import { APPROVE_WORDS, NEGATION, REJECT_WORDS, REVIEW_WORDS } from './assistant-actions';

export type FlowKind = 'create_member' | 'set_status' | 'set_amount' | 'add_donor';

export interface Field {
  key: string;
  /** What to ask for, in the second person. */
  ask: string;
  /** Offered as buttons when the answer is one of a few. */
  options?: { value: string; label: string }[];
  /** Skipped when this returns false — a rejection needs a reason, an approval does not. */
  when?: (collected: Record<string, string>) => boolean;
  /** Returns a complaint, or null when the answer is good. */
  check?: (value: string) => string | null;
  /** Something sensible when the administrator has nothing to add. */
  optional?: boolean;
}

export interface Flow {
  kind: FlowKind;
  /** Shown when the flow starts, so nobody wonders what they have begun. */
  opening: string;
  fields: Field[];
}

const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/** A password somebody has to read out over a counter without misreading it. */
export function suggestPassword(): string {
  const words = ['Falak', 'Chenab', 'Murree', 'Ravi', 'Hunza', 'Sutlej', 'Kaghan'];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(1000 + Math.random() * 9000)}`;
}

export const FLOWS: Record<FlowKind, Flow> = {
  create_member: {
    kind: 'create_member',
    opening: 'I can add someone. I need a few details — one at a time.',
    fields: [
      {
        key: 'full_name',
        ask: 'What is their full name?',
        check: (v) => (v.trim().length < 3 ? 'That looks too short for a full name.' : null),
      },
      {
        key: 'gender',
        ask: 'Are they male, female, or other?',
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'other', label: 'Other' },
        ],
        check: (v) =>
          ['male', 'female', 'other'].includes(v.trim().toLowerCase())
            ? null
            : 'Please answer male, female or other.',
      },
      {
        key: 'age',
        ask: 'How old are they?',
        check: (v) => {
          const n = Number(v.replace(/\D/g, ''));
          return Number.isFinite(n) && n >= 12 && n <= 120 ? null : 'Give an age between 12 and 120.';
        },
      },
      { key: 'city', ask: 'Which city do they live in?' },
      {
        key: 'email',
        ask: 'What is their email address? They sign in with it.',
        check: (v) => (isEmail(v) ? null : 'That does not look like an email address.'),
      },
      {
        key: 'mobile',
        ask: 'And their mobile number?',
        check: (v) =>
          v.replace(/\D/g, '').length >= 10 ? null : 'That does not look like a full mobile number.',
      },
      {
        key: 'password',
        ask: 'Lastly, a password to give them. Say "suggest" and I will make one up.',
        check: (v) =>
          v.trim().length >= 8 ? null : 'Passwords need at least 8 characters — or say "suggest".',
      },
    ],
  },

  set_status: {
    kind: 'set_status',
    opening: 'I can move an application along. Two or three things first.',
    fields: [
      {
        key: 'reference',
        ask: 'Which application? Give me its reference, like SHF-26-01001.',
        check: (v) =>
          /\bSHF[-\s]?\d{2}[-\s]?\d{1,6}\b/i.test(v) ? null : 'I need a reference like SHF-26-01001.',
      },
      {
        key: 'status',
        ask: 'What should it become?',
        options: [
          { value: 'accepted', label: 'Approve' },
          { value: 'rejected', label: 'Reject' },
          { value: 'review', label: 'Move to review' },
        ],
        check: (v) =>
          statusFromAnswer(v) ? null : 'Approve, reject, or move to review?',
      },
      {
        key: 'amount',
        ask: 'How much is approved? Say "as requested" to use the amount they asked for.',
        when: (c) => statusFromAnswer(c.status) === 'accepted',
        optional: true,
      },
      {
        key: 'note',
        ask: 'Why is it being rejected? The member is shown this.',
        when: (c) => statusFromAnswer(c.status) === 'rejected',
        check: (v) => (v.trim().length < 3 ? 'Please give a reason the member can read.' : null),
      },
    ],
  },

  /*
   * Correcting the figure on an application, from the chat.
   *
   * The reference question is skipped when the conversation has just been
   * about one — "edit the requested amount", said straight after looking at an
   * application, should not be answered with "which one?".
   */
  set_amount: {
    kind: 'set_amount',
    opening: 'I can correct the amount on an application.',
    fields: [
      {
        key: 'reference',
        ask: 'Which application? Give me its reference, like SHF-26-01001.',
        check: (v) =>
          /\bSHF[-\s]?\d{2}[-\s]?\d{1,6}\b/i.test(v) ? null : 'I need a reference like SHF-26-01001.',
      },
      {
        key: 'amount',
        ask: 'What should the requested amount be?',
        check: (v) => {
          const n = Number(v.replace(/[^\d.]/g, ''));
          return Number.isFinite(n) && n > 0 ? null : 'Give me an amount, like 1500.';
        },
      },
    ],
  },

  /*
   * Putting a member on the donor list.
   *
   * Two separate figures, deliberately asked separately. A pledge is what
   * somebody said they would give each month; a donation is what actually
   * arrived. Only the second moves the fund, and conflating them is how a
   * committee ends up spending against a promise.
   */
  add_donor: {
    kind: 'add_donor',
    opening: 'I can put them on the donor list.',
    fields: [
      {
        key: 'member',
        ask: 'Which member? Give me their name as it is registered.',
      },
      {
        key: 'pledge',
        ask: 'How much do they pledge each month? Say "none" if there is no fixed amount.',
        check: (v) =>
          /^(none|no|nothing|0)$/i.test(v.trim()) || Number(v.replace(/[^\d.]/g, '')) > 0
            ? null
            : 'Give me an amount, or say "none".',
      },
      {
        key: 'given',
        ask: 'And how much have they given this month? Say "none" if nothing yet.',
        check: (v) =>
          /^(none|no|nothing|0|not yet)$/i.test(v.trim()) || Number(v.replace(/[^\d.]/g, '')) > 0
            ? null
            : 'Give me an amount, or say "none".',
      },
    ],
  },
};

/** "none", "nothing", "not yet" — all of them mean zero. */
export function amountOrNone(answer = ''): number {
  if (/^(none|no|nothing|0|not yet|nil)$/i.test(answer.trim())) return 0;
  const n = Number(answer.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** What the administrator meant by their answer to the status question. */
export function statusFromAnswer(answer = ''): 'accepted' | 'rejected' | 'review' | null {
  const q = normalise(answer);
  // Rejection first: "do not approve" contains an approving word.
  if (REJECT_WORDS.test(q)) return 'rejected';
  if (APPROVE_WORDS.test(q)) return NEGATION.test(q) ? null : 'accepted';
  if (REVIEW_WORDS.test(q)) return 'review';
  return null;
}

/** The next thing to ask for, or null when everything is in. */
export function nextField(flow: Flow, collected: Record<string, string>): Field | null {
  return flow.fields.find((f) => !(f.key in collected) && (!f.when || f.when(collected))) ?? null;
}

/**
 * Does this sentence start a flow?
 *
 * Only phrasings that ask for the action without supplying it. "Aiman donated
 * 5000" is complete and is handled in one step; "add a new member" is an
 * opening line.
 */
export function flowFrom(question: string): FlowKind | null {
  const q = normalise(question);

  // Before the status flow: "change the requested amount" contains "change"
  // and "request", and is not a status change.
  if (
    /\b(edit|change|update|correct|amend|fix|set)\b/.test(q) &&
    /\b(amount|figure|sum)\b/.test(q)
  )
    return 'set_amount';

  // Before the member rule: "add him as a donor" contains both "add" and a
  // word for a person, and is about the donor list rather than a new account.
  if (/\b(add|make|register|put|set up|include)\b/.test(q) && /\bdonors?\b/.test(q))
    return 'add_donor';

  if (/\b(add|create|register|new)\b/.test(q) && /\b(member|user|person|account|someone)\b/.test(q))
    return 'create_member';

  if (
    /\b(update|change|set|move)\b/.test(q) &&
    /\b(status|application|request)\b/.test(q) &&
    !/\bSHF[-\s]?\d{2}\b/i.test(question)
  )
    return 'set_status';

  return null;
}
