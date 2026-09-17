/**
 * Understanding what a member is asking.
 *
 * The people using this portal are not the people who built it. Many will type
 * Roman Urdu, many will type three words with no question mark, and nobody
 * should have to learn a phrasing before the software will help them. So the
 * matching here is deliberately generous: stems rather than whole words, Urdu
 * and Roman Urdu alongside English, and — when nothing matches — a question
 * back rather than a guess.
 *
 * Nothing here touches the database. This decides what was asked; the route
 * decides what is true.
 */

import { normalise } from './assistant';

export type MemberTopic =
  /* how the portal works */
  | 'how_to_apply'
  | 'funds_list'
  | 'fund_limits'
  | 'documents_needed'
  | 'how_long'
  | 'statuses'
  | 'monthly_funds'
  | 'bank_details'
  | 'profile_change'
  | 'login_help'
  | 'language'
  | 'privacy'
  | 'contact'
  | 'capabilities'
  /* the member's own record */
  | 'my_requests'
  | 'request_status'
  | 'why_rejected'
  | 'money_received'
  | 'receipt'
  | 'my_bank'
  /* things the assistant does rather than answers */
  | 'apply_now'
  | 'attach_document'
  /* conversation */
  | 'greeting'
  | 'thanks'
  | 'unknown';

/**
 * Stems, matched as substrings. "appl" catches apply, applied, application
 * and applying — one entry instead of four, and no member has to guess which
 * form the software knows.
 */
const T: Record<Exclude<MemberTopic, 'unknown' | 'greeting' | 'thanks'>, string[]> = {
  /* ---- doing things ---- */
  apply_now: [
    'i want to apply',
    'i need money',
    'i need help with',
    'want to request',
    'start an application',
    'start application',
    'new application',
    'new request',
    'make a request',
    'apply now',
    'apply for',
    'darkhwast dena',
    'darkhwast deni',
    'paisay chahiye',
    'paise chahiye',
    'madad chahiye',
  ],
  attach_document: [
    'attach',
    'upload',
    'add a document',
    'add document',
    'add a file',
    'send the bill',
    'send bill',
    'send a photo',
    'send picture',
    'add a photo',
    'add photo',
    'add a bill',
    'add bill',
    'document bhej',
    'file bhej',
    'photo bhej',
  ],

  /* ---- how it works ---- */
  how_to_apply: [
    'how do i apply',
    'how to apply',
    'how can i apply',
    'how do i request',
    'how to request',
    'how do i submit',
    'how to submit',
    'how does it work',
    'how it works',
    'what do i do',
    'where do i apply',
    'process',
    'procedure',
    'steps',
    'tarika',
    'kaise apply',
    'kaisay apply',
    'kaise karu',
    'kaise karoon',
  ],
  funds_list: [
    'what fund',
    'which fund',
    'what can i apply',
    'what help',
    'what kind of help',
    'types of fund',
    'fund types',
    'list of fund',
    'available fund',
    'categories',
    'kon se fund',
    'kaun se fund',
  ],
  fund_limits: [
    'how much can i',
    'maximum',
    'minimum',
    'max amount',
    'min amount',
    'limit',
    'how much money can',
    'kitna mil',
    'kitne paise',
    'kitna paisa',
  ],
  documents_needed: [
    'what document',
    'which document',
    'what do i need to attach',
    'do i need a document',
    'need any document',
    'what papers',
    'proof',
    'required document',
    'kya document',
    'kagzat',
  ],
  how_long: [
    'how long',
    'how many days',
    'when will i',
    'when do i get',
    'how soon',
    'time does it take',
    'takes how',
    'kitna time',
    'kab tak',
    'kab mile',
    'kab milay',
  ],
  statuses: [
    'what does requested mean',
    'what does review mean',
    'what does approved mean',
    'what does transferred mean',
    'what does rejected mean',
    'what do the status',
    'what does the status mean',
    'meaning of status',
    'status ka matlab',
  ],
  monthly_funds: [
    'every month',
    'each month',
    'monthly fund',
    'recurring',
    'automatic',
    'do i apply again',
    'apply again every',
    'har mahine',
    'har maheenay',
  ],
  bank_details: [
    'how do i add my bank',
    'how to add bank',
    'add my bank',
    'add bank detail',
    'change my bank',
    'change bank',
    'update bank',
    'bank kaise',
    'account number kaise',
  ],
  profile_change: [
    'change my name',
    'change my number',
    'change my mobile',
    'change my city',
    'update my detail',
    'change my detail',
    'edit my profile',
    'change my email',
    'family detail',
    'dependant',
    'dependent',
  ],
  login_help: [
    'forgot my password',
    'forgot password',
    'reset my password',
    'reset password',
    'cannot sign in',
    'cant sign in',
    'can not log in',
    'cannot log in',
    'cant log in',
    'password bhool',
    'password nahi',
  ],
  language: ['urdu', 'english', 'language', 'zaban', 'translate'],
  privacy: [
    'can others see',
    'who can see',
    'is it private',
    'can anyone see',
    'see other member',
    'see the budget',
    'who donate',
  ],
  contact: [
    'talk to someone',
    'speak to someone',
    'phone number',
    'helpline',
    'contact',
    'call the office',
    'office email',
    'raabta',
  ],
  capabilities: [
    'what can you do',
    'what can you help',
    'who are you',
    'what are you',
    'how can you help',
    'tum kya kar',
    'aap kya kar',
  ],

  /* ---- their own record ---- */
  my_requests: [
    'my application',
    'my request',
    'my darkhwast',
    'what have i applied',
    'have i applied',
    'list my',
    'show my',
    'all my',
    'meri darkhwast',
  ],
  request_status: [
    'status',
    'what happened to',
    'any update',
    'update on',
    'track',
    'where is my',
    'has it been approved',
    'is it approved',
    'kya hua',
    'kahan tak',
  ],
  why_rejected: [
    'why was it rejected',
    'why rejected',
    'why was i rejected',
    'why not approved',
    'why was it refused',
    'reason for rejection',
    'rejected kyun',
    'kyun reject',
  ],
  money_received: [
    'how much have i received',
    'how much did i get',
    'how much money have i',
    'total received',
    'have i been paid',
    'did i get the money',
    'kitna mila',
    'paisa mila',
  ],
  receipt: [
    'receipt',
    'invoice',
    'proof of payment',
    'payment proof',
    'rasid',
    'raseed',
  ],
  my_bank: [
    'my bank detail',
    'what bank',
    'which account',
    'my account number',
    'do you have my bank',
    'is my bank',
  ],
};

/** The order matters: an earlier topic wins a sentence that matches two. */
const ORDER: (keyof typeof T)[] = [
  // Acting beats explaining: "I want to apply" is not a request for the manual.
  'attach_document',
  'apply_now',
  // Specific questions before the general ones they contain.
  'why_rejected',
  'how_long',
  'documents_needed',
  'fund_limits',
  'statuses',
  'monthly_funds',
  'login_help',
  'bank_details',
  'my_bank',
  'money_received',
  'receipt',
  'profile_change',
  'how_to_apply',
  'funds_list',
  'privacy',
  'capabilities',
  'contact',
  'language',
  'my_requests',
  'request_status',
];

const THANKS = /\b(thanks|thank you|thankyou|shukriya|shukria|jazak\w*|bahut meherbani|great|good job|ok thanks)\b/;

export function classifyMember(question: string): MemberTopic {
  const q = normalise(question);

  if (THANKS.test(q) && q.trim().split(' ').length <= 5) return 'thanks';

  for (const topic of ORDER) {
    if (T[topic].some((k) => q.includes(k))) return topic;
  }
  return 'unknown';
}

/**
 * Does this sentence want the application flow started, rather than described?
 *
 * "How do I apply" is a question about the process. "I want to apply" is
 * somebody asking to be taken through it. Getting this backwards is annoying
 * in one direction and alarming in the other, so the question words win.
 */
export function wantsToAct(question: string): boolean {
  const q = normalise(question);
  const asking = /\b(how|what|where|when|why|kaise|kaisay|kya|kab)\b/.test(q);
  return !asking;
}

/** The chips offered when the chat is opened. Questions a member actually has. */
export const MEMBER_SUGGESTIONS = [
  'How do I apply?',
  'What is the status of my application?',
  'What documents do I need?',
  'How much can I apply for?',
  'How long does it take?',
  'I want to apply',
];

/** Offered when nothing matched, so a dead end still points somewhere. */
export const MEMBER_FALLBACK = [
  'How do I apply?',
  'Show my applications',
  'What can you do?',
];
