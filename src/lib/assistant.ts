/**
 * Reading an admin's question well enough to run the right query.
 *
 * Deliberately not a language model. Every answer here is a figure the
 * committee may act on, and a model that is usually right about a balance is
 * worse than a tool that is always right about a narrower set of questions —
 * it would also mean posting the foundation's member data to a third party and
 * paying per question. This matches intent, runs SQL, and says plainly when it
 * does not understand.
 */

export type Intent =
  | 'donations'
  | 'transferred'
  | 'remaining'
  | 'new_members'
  | 'donor_count'
  | 'top_donors'
  | 'pending'
  | 'members_total'
  | 'by_status'
  | 'disbursed_total'
  | 'recurring'
  | 'help';

interface Rule {
  intent: Intent;
  /** All of these must appear for the rule to fire. */
  all?: string[][];
  /** At least one group must match, any word within a group counts. */
  any?: string[][];
  /** If any of these appear the rule is out — stops "donors" eating "donated". */
  not?: string[];
  weight: number;
}

/*
 * Order matters less than weight: the most specific readings score highest, so
 * "how many donors gave" beats the looser "donation" rule.
 */
const RULES: Rule[] = [
  {
    intent: 'help',
    any: [['help', 'what can you', 'what do you', 'commands', 'examples']],
    weight: 10,
  },
  {
    intent: 'remaining',
    any: [['remaining', 'left', 'balance', 'available', 'bacha', 'baqi']],
    weight: 9,
  },
  {
    intent: 'top_donors',
    all: [['top', 'biggest', 'largest', 'most', 'highest'], ['donor', 'donat', 'gave', 'giver']],
    weight: 9,
  },
  {
    intent: 'donor_count',
    all: [['how many', 'number of', 'count'], ['donor', 'donat', 'gave', 'giver']],
    weight: 8,
  },
  {
    intent: 'new_members',
    all: [['new', 'register', 'sign', 'join', 'onboard']],
    any: [['member', 'user', 'people', 'account', 'registration']],
    weight: 8,
  },
  {
    intent: 'members_total',
    all: [['how many', 'total', 'number of', 'count']],
    any: [['member', 'user', 'account']],
    not: ['new', 'register', 'sign', 'join', 'donat', 'donor'],
    weight: 6,
  },
  {
    intent: 'pending',
    any: [['pending', 'await', 'waiting', 'to review', 'review queue', 'outstanding', 'unapproved']],
    weight: 8,
  },
  {
    intent: 'transferred',
    any: [['transfer', 'paid out', 'disburs', 'sent out', 'payout', 'paid to']],
    not: ['total ever', 'all time', 'overall'],
    weight: 7,
  },
  {
    intent: 'disbursed_total',
    all: [['all time', 'overall', 'ever', 'in total', 'to date']],
    any: [['transfer', 'paid', 'disburs', 'given', 'gave', 'help']],
    weight: 9,
  },
  {
    intent: 'donations',
    any: [['fund', 'donat', 'receiv', 'came in', 'collect', 'rais', 'income']],
    weight: 6,
  },
  {
    intent: 'by_status',
    any: [['status', 'application', 'request', 'accepted', 'rejected', 'breakdown']],
    weight: 5,
  },
  {
    intent: 'recurring',
    any: [['recurring', 'standing', 'monthly arrangement', 'automatic', 'enrolled']],
    weight: 8,
  },
];

/**
 * Substring, so keywords are written as stems: "receiv" catches both "receive"
 * and "received", which are the same question asked two ways.
 */
const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

export function classify(question: string): Intent {
  const q = question.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ');

  let best: { intent: Intent; score: number } = { intent: 'help', score: 0 };

  for (const rule of RULES) {
    if (rule.not && hasAny(q, rule.not)) continue;
    if (rule.all && !rule.all.every((group) => hasAny(q, group))) continue;
    if (rule.any && !rule.any.some((group) => hasAny(q, group))) continue;
    if (!rule.all && !rule.any) continue;

    if (rule.weight > best.score) best = { intent: rule.intent, score: rule.weight };
  }

  return best.score > 0 ? best.intent : 'help';
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** Pakistan has no daylight saving, so one fixed offset is exact all year. */
function pkToday(): Date {
  return new Date(Date.now() + 5 * 60 * 60 * 1000);
}

const firstOf = (year: number, monthIndex: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;

/**
 * Which month is being asked about. Defaults to this one, because that is what
 * somebody means when they do not say.
 */
export function monthFrom(question: string): { month: string; explicit: boolean } {
  const q = question.toLowerCase();
  const now = pkToday();

  const iso = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return { month: `${iso[1]}-${iso[2]}-01`, explicit: true };

  if (/\blast month\b|\bprevious month\b|\bpichle\b/.test(q)) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return { month: firstOf(d.getUTCFullYear(), d.getUTCMonth()), explicit: true };
  }

  for (let i = 0; i < MONTHS.length; i++) {
    if (!q.includes(MONTHS[i].slice(0, 3))) continue;
    // "march" matches, but so should "mar 2025" — take a year if one is given.
    const year = q.match(/\b(20\d{2})\b/);
    return {
      month: firstOf(year ? Number(year[1]) : now.getUTCFullYear(), i),
      explicit: true,
    };
  }

  return { month: firstOf(now.getUTCFullYear(), now.getUTCMonth()), explicit: false };
}

export const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Offered as buttons so nobody has to guess what it understands. */
export const SUGGESTIONS = [
  'How much did we receive this month?',
  'How much have we transferred?',
  'What is the remaining balance?',
  'How many new members registered this month?',
  'How many donors gave this month?',
  'Who are the top donors?',
  'How many applications are pending?',
  'Show applications by status',
];
