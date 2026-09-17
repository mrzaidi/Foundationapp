/**
 * Applying, and attaching a document, one question at a time.
 *
 * The apply sheet asks for everything on one screen. That is the right shape
 * for somebody who knows what they are doing, and the wrong shape for somebody
 * who does not — a form with five fields and a file picker is where a person
 * who is already anxious about money gives up. So the assistant asks for one
 * thing, waits, and asks for the next.
 *
 * Nothing is written while a flow is in progress. The answers travel back and
 * forth with the conversation, and only the final confirmation submits — the
 * same rule the admin assistant follows, for the same reason.
 *
 * The questions live here; what a fund costs, which applications exist and
 * whether a document is required are looked up in the route, because those are
 * facts about the database rather than about the conversation.
 */

export type MemberFlowKind = 'apply' | 'attach';

export interface MemberPending {
  kind: MemberFlowKind;
  collected: Record<string, string>;
}

/** Every way somebody says "nothing to add here". */
export const SKIP = /^\s*(skip|none|no|nothing|na|nah|later|no thanks|nahi|nahin|nai|koi nahi)\s*$/i;

export const isSkip = (v = '') => SKIP.test(v);

/**
 * An amount as a member would write it: 5000, 5,000, Rs 5000, PKR 5000, 5k.
 * Lakh and crore are included because they are how sums are said here, even
 * where the portal's own limits make them unlikely.
 */
export function readAmount(answer = ''): number | null {
  const cleaned = answer.replace(/,/g, '');
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*(k|thousand|hazaar|hazar|lakh|lac|crore)?/i);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  switch ((m[2] ?? '').toLowerCase()) {
    case 'k':
    case 'thousand':
    case 'hazaar':
    case 'hazar':
      return n * 1_000;
    case 'lakh':
    case 'lac':
      return n * 100_000;
    case 'crore':
      return n * 10_000_000;
    default:
      return n;
  }
}

/**
 * Did the member abandon the flow?
 *
 * Somebody half way through an application who types "actually never mind"
 * should be let out, not asked the next question. Kept separate from skip: one
 * means "no answer to this", the other means "stop".
 */
export const CANCEL =
  /^\s*(cancel|stop|quit|exit|never ?mind|forget it|leave it|rehne do|rehnay do|chor do|band karo)\s*$/i;

export const isCancel = (v = '') => CANCEL.test(v);

/** The order the apply flow asks in. Files last: it is the slowest step. */
export const APPLY_STEPS = ['fund', 'amount', 'purpose', 'files'] as const;
export const ATTACH_STEPS = ['request', 'files'] as const;

export type ApplyStep = (typeof APPLY_STEPS)[number];
export type AttachStep = (typeof ATTACH_STEPS)[number];

/** The first step of a flow that has not been answered yet. */
export function nextStep(kind: MemberFlowKind, collected: Record<string, string>): string | null {
  const steps: readonly string[] = kind === 'apply' ? APPLY_STEPS : ATTACH_STEPS;
  return steps.find((s) => !(s in collected)) ?? null;
}
