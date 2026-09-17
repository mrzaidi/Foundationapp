/**
 * Understanding what a member is asking.
 *
 * The people using this portal are not the people who built it. Many will type
 * Roman Urdu, many will type three words with no question mark, and nobody
 * should have to learn a phrasing before the software will help them.
 *
 * This started as lists of whole phrases, and that was the wrong shape. "I
 * want to apply" was understood and "I want to submit a fund request" was not,
 * which is not a difference any member could be expected to guess — it only
 * meant somebody had thought of one sentence and not the other. Listing
 * sentences is a losing game: there is always another way to say it.
 *
 * So the common intents are matched as a VERB and an OBJECT occurring
 * separately, in any order, with any words between them. "Submit a fund
 * request", "I need to make an application", "want to raise a request",
 * "darkhwast deni hai" all carry the same two parts, and all reach the same
 * place. Whole phrases are kept only where a phrase really is the unit of
 * meaning, like "what does under review mean".
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

/* ------------------------------------------------------------------ *
 * The parts a sentence is built from                                  *
 * ------------------------------------------------------------------ */

/** Anything that turns a sentence into a question rather than an instruction. */
const ASKING =
  /\b(how|what|which|where|when|why|who|whose|whom|kaise|kaisay|kaisy|kya|kia|kab|kahan|kon|kaun|kitna|kitni|kitne)\b|کیا|کیسے|کیسا|کتنا|کتنی|کتنے|کب|کہاں|کون|کیوں/;

/** Wanting, or doing. "I want to", "I need to", "please make", "submit". */
const WANT = /\b(want|wanna|wish|need|require|like|chahta|chahti|chahiye|chahye)\b/;
/**
 * Urdu for actually making an application.
 *
 * Deliberately not the bare word درخواست. That also appears in "میری درخواست
 * کا کیا بنا؟" — where has my application got to — which is a question about
 * one that already exists, and opening a new application in reply to it would
 * be alarming. The verb has to be there as well.
 */
const UR_APPLY = /درخواست\s*(دیں|دینا|دینی|دے|دوں)|فنڈ کے لیے درخواست/;

const DO_VERB =
  /\b(submit|submitting|make|making|start|starting|create|creating|file|filing|raise|raising|lodge|send|sending|put|putting|open|opening|apply|applying|register|registering|raise|do|karna|karni|karu|karoon|dena|deni|dalna)\b/;

/** The thing being applied for. */
const THING =
  /\b(application|applications|apply|request|requests|fund|funds|form|case|claim|grant|darkhwast|darkhwaast|madad|assistance)\b/;

/** Words for a document, however a member would say it. */
const DOC =
  /\b(document|documents|documentation|file|files|photo|photos|photograph|picture|pic|pics|image|images|scan|bill|bills|invoice|receipt|report|reports|voucher|slip|paper|papers|proof|cnic|attachment|attachments|kagzat|kaghzat)\b/;

/** Putting a document somewhere. */
const ATTACH_VERB =
  /\b(attach|attaching|upload|uploading|add|adding|send|sending|share|sharing|give|submit|bhej|bhejna|bhejni|lagana|laga)\b/;

/** Money that has already arrived, as opposed to money being asked for. */
const GOT = /\b(receiv\w*|got|gotten|paid|given|mila|milay|mile|miley)\b/;
const MINE = /\b(i|me|my|mine|meri|mera|mujhe|hum)\b/;

/**
 * "Could get", as opposed to "did get".
 *
 * "kitna mila" is how much arrived; "kitna mil sakta hai" is how much a fund
 * allows. One word apart, and answering either with the other is the kind of
 * mistake that makes somebody stop trusting the thing.
 */
const MAYBE = /\b(sakta|sakti|sakte|can|could|able|maximum|max|limit|limits)\b/;
/** Roman Urdu for getting, in its bare and inflected forms. */
const URDU_GET = /\b(mil|milay|mile|mila|milta|milti|milega|milay ga)\b/;

const HOW_MUCH =
  /\b(how much|how many|maximum|minimum|max|min|limit|limits|upto|up to|range|kitna|kitni|kitne)\b/;
const MONEY = /\b(money|paisa|paise|paisay|rupee|rupees|rs|pkr|amount|raqam)\b/;

/* ------------------------------------------------------------------ *
 * Phrases that really are phrases                                     *
 * ------------------------------------------------------------------ */

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

interface Rule {
  topic: MemberTopic;
  test: (q: string) => boolean;
}

/**
 * Order matters: the first rule that matches wins, so the specific questions
 * come before the general ones that contain them.
 */
const RULES: Rule[] = [
  /* ---- privacy, before anything that notices "my application" ---- */
  {
    topic: 'privacy',
    test: (q) =>
      has(q, [
        'can others see',
        'who can see',
        'who else can',
        'anyone else',
        'other member',
        'someone else see',
        'is it private',
        'private',
        'confidential',
        'see the budget',
        'who donate',
      ]),
  },

  /* ---- why a decision went the way it did ---- */
  {
    topic: 'why_rejected',
    test: (q) =>
      /\b(reject\w*|declin\w*|refus\w*|denied|deny)\b/.test(q) &&
      (ASKING.test(q) || has(q, ['reason', 'kyun', 'kyu', 'kiun'])),
  },

  /* ---- attaching a document ---- */
  {
    topic: 'attach_document',
    test: (q) => ATTACH_VERB.test(q) && DOC.test(q),
  },

  /* ---- what they have already been given ---- */
  {
    topic: 'money_received',
    test: (q) =>
      GOT.test(q) &&
      // Urdu drops the pronoun: "kitna mila" is already about them.
      (MINE.test(q) || /\b(mila|milay|mile)\b/.test(q)) &&
      !MAYBE.test(q) &&
      !/\bwill\b/.test(q),
  },

  { topic: 'receipt', test: (q) => has(q, ['receipt', 'invoice', 'rasid', 'raseed', 'rasheed']) },

  /* ---- how much a fund allows, before the act-of-applying rule ----
     "How much can I apply for?" carries an applying verb, but it is a
     question about money and must not be answered with the four steps. */
  {
    topic: 'fund_limits',
    test: (q) => HOW_MUCH.test(q) && (THING.test(q) || MONEY.test(q) || URDU_GET.test(q)),
  },

  /* ---- an instruction to apply ----
     A verb of wanting or doing, plus the thing being applied for, and no
     question word. That is what "I want to submit a fund request in grocery
     fund category" has in common with "apply now" and with "darkhwast deni
     hai" — and none of them share a phrase. */
  {
    topic: 'apply_now',
    test: (q) =>
      !ASKING.test(q) &&
      (((WANT.test(q) || DO_VERB.test(q)) && THING.test(q) && !DOC.test(q)) ||
        // "Apply for a fund" — the option, said plainly.
        (/\bapply\b/.test(q) && /\bfunds?\b/.test(q)) ||
        UR_APPLY.test(q)),
  },

  /* ---- how long ---- */
  {
    topic: 'how_long',
    test: (q) =>
      has(q, ['how long', 'how many days', 'how soon', 'kitna time', 'kab tak', 'kab mile', 'kab milay']) ||
      (/\b(when)\b/.test(q) && /\b(get|receiv\w*|paid|approved|decision|answer)\b/.test(q)),
  },

  /* ---- what the statuses mean ---- */
  {
    topic: 'statuses',
    test: (q) =>
      (/\b(mean|means|meaning|matlab)\b/.test(q) &&
        /\b(requested|review|reviewing|approved|accepted|transferred|rejected|status|statuses)\b/.test(q)) ||
      has(q, ['what are the status', 'what do the status', 'status ka matlab']),
  },

  /* ---- documents a fund needs ---- */
  {
    topic: 'documents_needed',
    test: (q) => DOC.test(q) && (ASKING.test(q) || /\b(need|require|necessary|zaroori)\b/.test(q)),
  },

  { topic: 'monthly_funds', test: (q) => has(q, ['every month', 'each month', 'monthly', 'recurring', 'automatic', 'har mahine', 'har maheenay', 'apply again']) },

  {
    topic: 'login_help',
    test: (q) =>
      /\b(password|sign in|signin|login|log in|account locked)\b/.test(q) &&
      /\b(forgot|forget|lost|reset|change|cannot|cant|can not|nahi|bhool|bhul)\b/.test(q),
  },

  /* ---- bank details: theirs, or how to add them ---- */
  {
    topic: 'my_bank',
    test: (q) =>
      /\b(bank|account|iban)\b/.test(q) &&
      (has(q, ['do you have', 'what bank', 'which account', 'my account number']) ||
        (MINE.test(q) && !/\b(add|change|update|edit|set|kaise|how)\b/.test(q))),
  },
  {
    topic: 'bank_details',
    test: (q) => /\b(bank|account|iban)\b/.test(q),
  },

  /* ---- their own profile ---- */
  {
    topic: 'profile_change',
    test: (q) =>
      /\b(change|update|edit|correct|amend|fix|wrong)\b/.test(q) &&
      /\b(name|number|mobile|phone|city|age|email|address|detail|details|profile|family|dependant|dependent)\b/.test(q),
  },

  /* ---- where their own application has got to ----
     Before the general how-to: "what is the status of my application" is a
     question containing the word application, and used to be answered with
     the four steps of applying. */
  {
    topic: 'request_status',
    test: (q) =>
      has(q, ['status', 'any update', 'update on', 'track', 'what happened to', 'where is my', 'has it been', 'is it approved', 'kya hua', 'kahan tak']),
  },

  /* ---- what funds exist, also before the general how-to ----
     "What funds are there?" is about the list, not about applying. */
  {
    topic: 'funds_list',
    test: (q) =>
      /\bfunds?\b/.test(q) &&
      (ASKING.test(q) || has(q, ['list', 'available', 'categories', 'category', 'types', 'kon se', 'kaun se'])),
  },

  /* ---- how applying works ----
     Narrowed to words about applying. It used to accept any question that
     mentioned a fund, which swallowed both of the rules above. */
  {
    topic: 'how_to_apply',
    test: (q) =>
      (ASKING.test(q) &&
        /\b(appl\w*|submit|submitting|request|requests|darkhwast|form)\b/.test(q)) ||
      has(q, ['how does it work', 'how it works', 'process', 'procedure', 'steps', 'tarika', 'tareeka']),
  },

  { topic: 'language', test: (q) => has(q, ['urdu', 'english', 'language', 'zaban', 'translate']) },

  {
    topic: 'capabilities',
    test: (q) =>
      has(q, ['what can you', 'what do you do', 'who are you', 'what are you', 'how can you help', 'tum kya kar', 'aap kya kar', 'help me with']),
  },

  {
    topic: 'contact',
    test: (q) =>
      has(q, ['talk to', 'speak to', 'phone number', 'helpline', 'contact', 'call the office', 'office email', 'raabta', 'rabta', 'complain']),
  },

  /* ---- listing their own applications ----
     Last, because "my application" appears in half the questions above. */
  {
    topic: 'my_requests',
    test: (q) => MINE.test(q) && THING.test(q),
  },
];

const THANKS =
  /\b(thanks|thank you|thankyou|shukriya|shukria|shukr\w*|jazak\w*|meherbani|great|good job|well done)\b/;

export function classifyMember(question: string): MemberTopic {
  const q = normalise(question);

  if (THANKS.test(q) && q.trim().split(' ').length <= 5) return 'thanks';

  for (const rule of RULES) if (rule.test(q)) return rule.topic;
  return 'unknown';
}

/**
 * Does this sentence want something done, rather than explained?
 *
 * "How do I apply" is a question about the process. "I want to apply" is
 * somebody asking to be taken through it. Getting this backwards is annoying
 * in one direction and alarming in the other, so a question word always wins.
 */
export function wantsToAct(question: string): boolean {
  return !ASKING.test(normalise(question));
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
export const MEMBER_FALLBACK = ['How do I apply?', 'Show my applications', 'What can you do?'];
