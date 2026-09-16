/**
 * Reading an admin's question well enough to run the right query.
 *
 * Two passes. First the question is matched against the things the foundation
 * is actually asked about — money in, money out, who is waiting. If none of
 * those fit, the significant words are pulled out and looked up as *subjects*:
 * a member's name, a fund, an application reference. That is what makes "what
 * about Aiman?" answerable without a fixed phrasing.
 *
 * Every figure this produces is read from Postgres. When a language model is
 * configured it is given those figures and asked only to read the question and
 * word the reply — it is never the source of a number, because a model that is
 * usually right about a balance is worse than a tool that is always right.
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
  | 'month_summary'
  | 'missing_bank'
  | 'missing_cnic'
  | 'blocked_members'
  | 'rejected'
  | 'biggest_request'
  | 'fund_breakdown'
  | 'fx_rate'
  | 'member_lookup'
  | 'request_lookup'
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
    any: [['help', 'what can you', 'what do you', 'commands', 'examples', 'how do you work']],
    weight: 10,
  },
  {
    intent: 'missing_bank',
    any: [
      [
        'no bank',
        'without bank',
        'missing bank',
        'bank missing',
        'bank not',
        'not added bank',
        'no account detail',
        'missing account',
        'cannot be paid',
        'can t be paid',
      ],
    ],
    weight: 11,
  },
  {
    intent: 'missing_cnic',
    all: [['cnic', 'nic', 'id card', 'identity']],
    any: [['missing', 'without', 'not upload', 'pending', 'incomplete', 'who has not']],
    weight: 11,
  },
  {
    intent: 'month_summary',
    any: [
      [
        'summary',
        'overview',
        'snapshot',
        'how are we doing',
        'how is the month',
        'everything',
        'all the numbers',
        'full picture',
        'brief me',
      ],
    ],
    weight: 10,
  },
  {
    intent: 'fx_rate',
    any: [
      [
        'exchange rate',
        'dollar rate',
        'euro rate',
        'usd rate',
        'eur rate',
        'conversion rate',
        'rate today',
      ],
    ],
    weight: 10,
  },
  {
    intent: 'remaining',
    any: [['remaining', 'left', 'balance', 'available', 'in the budget', 'bacha', 'baqi']],
    weight: 9,
  },
  {
    intent: 'top_donors',
    all: [['top', 'biggest', 'largest', 'most', 'highest'], ['donor', 'donat', 'gave', 'giver']],
    weight: 9,
  },
  {
    // "Who gave?" is the same question as "top donors", asked the plain way.
    intent: 'top_donors',
    any: [
      ['who gave', 'who donat', 'who has given', 'who paid in', 'who contributed', 'which donor'],
    ],
    weight: 9,
  },
  {
    intent: 'biggest_request',
    all: [['biggest', 'largest', 'highest', 'most expensive', 'max']],
    any: [['request', 'application', 'asked', 'claim', 'amount', 'grant']],
    not: ['donor', 'donat'],
    weight: 9,
  },
  {
    intent: 'fund_breakdown',
    any: [
      [
        'which fund',
        'by fund',
        'fund type',
        'per fund',
        'each fund',
        'categor',
        'what are the fund',
        'list of fund',
        'kind of fund',
      ],
    ],
    weight: 9,
  },
  {
    intent: 'blocked_members',
    any: [['blocked', 'suspended', 'banned', 'barred']],
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
    not: ['new', 'register', 'sign', 'join', 'donat', 'donor', 'blocked'],
    weight: 6,
  },
  {
    intent: 'pending',
    any: [['pending', 'await', 'waiting', 'to review', 'review queue', 'outstanding', 'unapproved']],
    weight: 8,
  },
  {
    intent: 'rejected',
    any: [['reject', 'declin', 'turned down', 'refus']],
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
    all: [['all time', 'overall', 'ever', 'in total', 'to date', 'since']],
    any: [['transfer', 'paid', 'disburs', 'given', 'gave', 'help']],
    weight: 9,
  },
  {
    intent: 'donations',
    any: [['fund', 'donat', 'receiv', 'came in', 'collect', 'rais', 'income', ' get ', ' got ']],
    weight: 6,
  },
  {
    intent: 'by_status',
    any: [['status', 'application', 'request', 'accepted', 'breakdown']],
    weight: 5,
  },
  {
    intent: 'recurring',
    any: [['recurring', 'standing', 'monthly arrangement', 'automatic', 'enrolled']],
    weight: 8,
  },
];

/** Punctuation out, single spaces, padded so whole words can be tested. */
export const normalise = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

/**
 * Substring, so keywords are written as stems: "receiv" catches both "receive"
 * and "received", which are the same question asked two ways.
 */
const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

export function classify(question: string): Intent {
  const q = normalise(question);

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

/* ------------------------------------------------------------------ *
 * Subjects — the "main word" in a question that names a thing         *
 * ------------------------------------------------------------------ */

/** Grammar and question scaffolding: never the subject of a question. */
const STOPWORDS = new Set(
  (
    'a an and any are as at be been by can could did do does for from get give given got had has ' +
    'have how if in into is it its just know last many me much my of on one only or our out ' +
    'please show so some tell that the their them then there these they this to tell us was we ' +
    'were what when where which who whom whose why will with would you your about all also am ' +
    'before between during each more most not now other over same than through under very year ' +
    'years today list want need tell'
  ).split(' ')
);

/**
 * Words that mean something to the foundation, so they are never read as a
 * person's name — a member called "May", or a fund whose name is a common
 * word, would otherwise swallow half the questions asked here.
 */
const DOMAIN_WORDS = new Set(
  (
    'fund funds donor donors donation donations donate donated member members user users admin ' +
    'admins account accounts amount amounts transfer transferred transfers balance remaining ' +
    'left request requests application applications status pending review reviewed accepted ' +
    'rejected approved blocked bank cnic nic budget money cash pkr rupee rupees euro euros ' +
    'dollar dollars january february march april may june july august september october november ' +
    'december foundation monthly recurring family income expense report summary total'
  ).split(' ')
);

/** The words left once grammar is stripped — the "main words" of a question. */
export function keywords(question: string): string[] {
  return normalise(question)
    .trim()
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Somebody saying hello rather than asking anything.
 *
 * Only when that is the whole message. "Hello, how much is left?" is a
 * question with a greeting attached, and answering the greeting instead of the
 * question would be worse than ignoring it.
 */
export function isGreeting(question: string): boolean {
  const q = normalise(question);
  if (q.trim().split(' ').length > 4) return false;
  return /\b(hi|hey|hello|hiya|salam|salaam|assalam\w*|aoa|yo)\b|\bgood (morning|afternoon|evening)\b/.test(
    q
  );
}

/** SHF-26-00001, however it was typed. */
export function referenceFrom(question: string): string | null {
  const m = question.toUpperCase().match(/\bSHF[-\s]?(\d{2})[-\s]?(\d{1,6})\b/);
  return m ? `SHF-${m[1]}-${m[2].padStart(5, '0')}` : null;
}

export interface Candidate {
  id: string;
  /** What the admin would type: a person's name, a fund's name. */
  name: string;
  /** Anything else worth matching on, e.g. an email address. */
  aliases?: string[];
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Which of these things is the question about?
 *
 * Scored by how much of the candidate's name the question actually contains,
 * matched whole-word so "ali" does not fire inside "quality". Longer words
 * count for more, because a surname carries more intent than an initial.
 */
export function rank<T extends Candidate>(question: string, candidates: T[]): Ranked<T>[] {
  const q = normalise(question);

  return candidates
    .map((item) => {
      const tokens = new Set(
        [item.name, ...(item.aliases ?? [])]
          .join(' ')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 2 && !DOMAIN_WORDS.has(t) && !STOPWORDS.has(t))
      );

      let score = 0;
      for (const t of tokens) if (q.includes(` ${t} `)) score += t.length;
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Whole words only. A loose "mar" substring reads March out of "summary",
 * which is how "give me a summary" quietly became a question about March.
 */
const MONTHS = [
  /\bjan(uary)?\b/,
  /\bfeb(ruary)?\b/,
  /\bmar(ch)?\b/,
  /\bapr(il)?\b/,
  /\bmay\b/,
  /\bjun(e)?\b/,
  /\bjul(y)?\b/,
  /\baug(ust)?\b/,
  /\bsep(t|tember)?\b/,
  /\boct(ober)?\b/,
  /\bnov(ember)?\b/,
  /\bdec(ember)?\b/,
];

/**
 * "May" is also an ordinary English verb, so it only counts as a month when
 * the sentence treats it as one — "in May", "May 2026".
 */
const MAY_AS_MONTH = /\b(in|for|of|during|since|month of)\s+may\b|\bmay\s+20\d{2}\b/;

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
    if (!MONTHS[i].test(q)) continue;
    if (i === 4 && !MAY_AS_MONTH.test(q)) continue;
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
  'Give me a summary of this month',
  'What is the remaining balance?',
  'How much did we receive this month?',
  'How much have we transferred?',
  'How many new members registered this month?',
  'Who are the top donors?',
  'How many applications are pending?',
  'Which members have no bank details?',
];

/** Shown when it cannot place a question, so the boundary is never a mystery. */
export const CAPABILITIES = [
  'Money in and out — donations, transfers, what is left, in any month',
  'People — who registered, who is blocked, who is missing bank details or a CNIC',
  'Applications — pending, rejected, by status, by fund, the largest one',
  'A person by name — everything on file for them',
  'An application by its reference, e.g. SHF-26-00001',
];

/**
 * The words that turn a sentence into an instruction rather than a question.
 *
 * Listed for the administrator because a chat box gives no clue what it
 * understands, and guessing at phrasing until something works is a miserable
 * way to use software. Any of these verbs, with a name and an amount, is
 * enough — the exact wording around them does not matter.
 */
export const WRITE_VOCABULARY: { does: string; words: string; example: string }[] = [
  {
    does: 'Record or change a donation',
    words: 'add · record · log · enter · received · update · change · set · donated · gave',
    example: 'Add 5000 donation for Aiman',
  },
  {
    does: 'Remove a donation',
    words: 'remove · delete · clear · cancel · undo',
    example: 'Remove Aiman donation',
  },
  {
    does: 'Set a monthly pledge',
    words: 'pledge · pledged · commits · promises',
    example: 'Set Aiman pledge to 2000',
  },
  {
    does: 'Take someone off the donor list (or put them back)',
    words: 'deactivate · disable · remove as donor · activate · reactivate',
    example: 'Deactivate Aiman as a donor',
  },
  {
    does: 'Decide an application',
    words: 'approve · accept · reject · decline · move to review',
    example: 'Approve SHF-26-00001 at 5000',
  },
  {
    does: 'Block or restore a member',
    words: 'block · suspend · unblock · reinstate',
    example: 'Block Zaidi',
  },
];
