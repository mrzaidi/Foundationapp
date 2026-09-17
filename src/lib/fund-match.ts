/**
 * Working out which fund somebody needs from what they say they need.
 *
 * The picker lists five funds with their descriptions, and that is fine for
 * anybody who already knows the foundation's categories. Somebody arriving
 * with a problem does not think in categories: they think "bijli ka bill",
 * "my son's school", "accident ho gaya". Making them map that onto a list
 * themselves is the moment the wrong fund gets chosen and the application
 * comes back rejected for being in the wrong place.
 *
 * So they describe the need in their own words — English or Roman Urdu or
 * Urdu — and the fund that fits is offered. It is a suggestion, never a
 * decision: every fund stays in the list underneath, and the member can
 * ignore the suggestion entirely.
 */

import type { FundType } from './types';

/** Punctuation out, single spaces, padded so whole words can be tested. */
const normalise = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

/**
 * What each fund is for, in the words people actually use.
 *
 * Keyed by the fund's id where the foundation's own slugs are known, and the
 * matcher falls back to the fund's name and description for anything added
 * later — so a new fund is never invisible to this, just less well served
 * until somebody adds its words here.
 */
const WORDS: Record<string, string[]> = {
  electricity: [
    'electricity', 'electric', 'power', 'light', 'lights', 'wapda', 'lesco', 'iesco',
    'gepco', 'k electric', 'utility', 'utilities', 'meter', 'unit', 'units',
    'bijli', 'bijly', 'bijlee', 'bill', 'bil', 'connection cut', 'disconnected',
  ],
  school: [
    'school', 'college', 'university', 'education', 'educational', 'study', 'studies',
    'student', 'tuition', 'fee', 'fees', 'admission', 'books', 'uniform', 'exam',
    'semester', 'academy', 'madrasa', 'taleem', 'parhai', 'bachay ki fees', 'daakhla',
  ],
  grocery: [
    'grocery', 'groceries', 'food', 'ration', 'rashan', 'atta', 'flour', 'rice',
    'chawal', 'ghee', 'oil', 'sugar', 'cheeni', 'daal', 'dal', 'kitchen', 'khana',
    'eat', 'eating', 'hungry', 'bhook', 'monthly shopping', 'sauda',
  ],
  accidental: [
    'accident', 'accidental', 'emergency', 'injury', 'injured', 'hospital', 'medical',
    'medicine', 'operation', 'surgery', 'doctor', 'illness', 'ill', 'sick', 'disease',
    'treatment', 'ambulance', 'fracture', 'burn', 'hadsa', 'haadsa', 'bimari',
    'bemari', 'ilaj', 'ilaaj', 'dawai', 'zakhmi', 'chot',
  ],
  monthly: [
    'monthly', 'every month', 'each month', 'regular', 'ongoing', 'stipend',
    'allowance', 'pension', 'support', 'wazifa', 'har mahine', 'har maheenay',
    'mahana', 'mahaana',
  ],
};

export interface Suggestion {
  fund: FundType;
  /** Higher is a better fit. Only used to order them. */
  score: number;
  /** The words that matched, so the screen can say why. */
  because: string[];
}

/**
 * Score the funds against a described need.
 *
 * A longer word matching counts for more than a short one: "school" fitting is
 * worth more than "fee", which appears in several sentences that are not about
 * school at all. Nothing is returned below a threshold — a guess offered with
 * no real evidence is worse than showing the plain list, because it looks like
 * the software knows something it does not.
 */
export function suggestFunds(need: string, funds: FundType[]): Suggestion[] {
  const q = normalise(need);
  if (q.trim().length < 2) return [];

  const scored: Suggestion[] = funds.map((fund) => {
    const because: string[] = [];
    let score = 0;

    for (const word of WORDS[fund.id] ?? []) {
      if (q.includes(` ${word} `) || q.includes(`${word} `) || q.includes(` ${word}`)) {
        score += word.length >= 6 ? 3 : 2;
        because.push(word);
      }
    }

    // A fund the words table does not cover is still matched on its own name,
    // so adding a fund never makes it unreachable here.
    for (const part of normalise(fund.name).trim().split(' ')) {
      if (part.length > 3 && q.includes(part)) {
        score += 3;
        if (!because.includes(part)) because.push(part);
      }
    }

    return { fund, score, because };
  });

  return scored
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Examples to put under the box, so it is obvious what to type.
 *
 * Deliberately phrased as somebody would say them, not as the fund names —
 * the whole point is that the member does not have to know the fund names.
 */
export const NEED_EXAMPLES: Record<'en' | 'ur', string[]> = {
  en: ['Electricity bill', 'School fees', 'Ration for the month', 'Hospital treatment'],
  ur: ['بجلی کا بل', 'اسکول کی فیس', 'مہینے کا راشن', 'ہسپتال کا علاج'],
};
