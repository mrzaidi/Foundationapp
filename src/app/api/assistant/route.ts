import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isGreeting, referenceFrom } from '@/lib/assistant';
import { classifyMember, MEMBER_FALLBACK, MEMBER_SUGGESTIONS, wantsToAct } from '@/lib/member-assistant';
import { MEMBER_GUIDE } from '@/lib/member-guide';
import {
  isCancel,
  isSkip,
  nextStep,
  readAmount,
  type MemberPending,
} from '@/lib/member-flows';
import { explain, geminiReady, phrase, translate } from '@/lib/gemini';
import { hasBankDetails } from '@/lib/banks';
import { money } from '@/lib/format';
import type { FundRequest, FundType, Profile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * What comes back                                                     *
 * ------------------------------------------------------------------ */

interface Figure {
  label: string;
  value: string;
}

export interface MemberAction {
  kind: 'apply' | 'attach';
  fundId?: string;
  fundName?: string;
  amount?: number;
  purpose?: string | null;
  requestId?: string;
  reference?: string;
  /** Files are held by the browser until the member confirms; this is the count. */
  fileCount?: number;
}

interface Answer {
  text: string;
  figures?: Figure[];
  link?: { href: string; label: string };
  suggestions?: string[];
  options?: { value: string; label: string }[];
  /** Show the file picker under this message — the flow is asking for documents. */
  wantsFiles?: boolean;
  /** Nothing happens until the member presses Confirm. */
  action?: MemberAction;
}

/* ------------------------------------------------------------------ *
 * Words a member reads                                                *
 * ------------------------------------------------------------------ */

const STATUS_WORD: Record<string, string> = {
  requested: 'waiting to be looked at',
  review: 'being reviewed by the committee',
  accepted: 'approved — the transfer is being arranged',
  transferred: 'paid',
  rejected: 'not approved',
};

const STATUS_LABEL: Record<string, string> = {
  requested: 'Requested',
  review: 'Under review',
  accepted: 'Approved',
  transferred: 'Transferred',
  rejected: 'Rejected',
};

const dayLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

/** The amount that matters: what was approved once there is one. */
const settled = (r: FundRequest) => Number(r.amount_approved ?? r.amount_requested);

const fundName = (r: FundRequest) => r.fund_types?.name ?? 'a fund';

/* ------------------------------------------------------------------ *
 * The endpoint                                                        *
 * ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let body: {
    question?: string;
    pending?: MemberPending | null;
    /** Set by the browser once files have been chosen for the current step. */
    fileCount?: number;
    /** Which language the portal is being read in, so the reply matches it. */
    locale?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 });
  }

  const question = (body.question ?? '').trim();
  const locale = body.locale === 'ur' ? 'ur' : 'en';
  if (!question && !body.fileCount)
    return NextResponse.json({ error: 'Ask me something.' }, { status: 422 });

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  const me = profileRow as Profile | null;
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const firstName = (me.full_name ?? '').split(' ')[0] || 'there';

  /* ---- data, fetched only when a question needs it ---- */
  let fundCache: FundType[] | null = null;
  const funds = async (): Promise<FundType[]> => {
    if (!fundCache) {
      const { data } = await supabase
        .from('fund_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      fundCache = (data ?? []) as FundType[];
    }
    return fundCache;
  };

  let mineCache: FundRequest[] | null = null;
  const mine = async (): Promise<FundRequest[]> => {
    if (!mineCache) {
      const { data } = await supabase
        .from('fund_requests')
        .select('*, fund_types(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      mineCache = (data ?? []) as FundRequest[];
    }
    return mineCache;
  };

  const bankOnFile = hasBankDetails(me);

  /**
   * Wrap a reply so every exit point has the same shape — and, when the portal
   * is being read in Urdu, so is the answer.
   *
   * Translating here rather than at each of the forty places an answer is
   * composed means no reply can be forgotten, and the English stays the single
   * version anybody has to keep true. If the model is unavailable the English
   * shows through, which is the right answer in the wrong language: worse than
   * Urdu, far better than nothing.
   */
  const reply = async (answer: Answer, pending: MemberPending | null = null) => {
    if (locale === 'ur' && geminiReady() && answer.text) {
      const said = await translate(answer.text, locale);
      if (said) answer = { ...answer, text: said };
    }
    return NextResponse.json({ answer, pending });
  };

  /* ================================================================ *
   * A flow in progress owns the next message                          *
   * ================================================================ */

  if (body.pending) {
    if (isCancel(question))
      return reply({
        text: 'No problem — I have stopped that. Ask me anything else whenever you like.',
        suggestions: MEMBER_FALLBACK,
      });

    const out = await step(body.pending, question, body.fileCount ?? 0);
    if (out) return out;
    // step() returning nothing means the flow could not continue; fall through
    // to normal answering rather than leaving the member with silence.
  }

  /* ================================================================ *
   * Conversation                                                      *
   * ================================================================ */

  if (isGreeting(question))
    return reply({
      text: `Hello ${firstName}. I can explain how anything here works, tell you where your applications have got to, or take you through a new one. What would you like?`,
      suggestions: MEMBER_SUGGESTIONS.slice(0, 3),
    });

  const topic = classifyMember(question);

  if (topic === 'thanks')
    return reply({
      text: 'You are very welcome. I am here whenever you need me.',
      suggestions: MEMBER_FALLBACK,
    });

  /* ================================================================ *
   * Starting a flow                                                   *
   * ================================================================ */

  if (topic === 'apply_now' && wantsToAct(question)) return startApply();
  if (topic === 'attach_document' && wantsToAct(question)) return startAttach();

  /* ================================================================ *
   * Their own record                                                  *
   * ================================================================ */

  switch (topic) {
    case 'my_requests': {
      const list = await mine();
      if (!list.length)
        return reply({
          text: 'You have not made any applications yet. I can take you through one now if you like — it takes a minute.',
          options: [{ value: 'apply', label: 'Apply now' }],
          suggestions: ['How do I apply?', 'What funds are there?'],
        });

      const open = list.filter((r) => r.status !== 'transferred' && r.status !== 'rejected');
      return reply({
        text: await worded(
          `You have ${list.length} application${list.length === 1 ? '' : 's'}${
            open.length ? `, ${open.length} still in progress` : ''
          }. Here are the most recent.`,
          { applications: list.slice(0, 5).map(brief) }
        ),
        figures: list.slice(0, 5).map((r) => ({
          label: `${r.reference} · ${fundName(r)}`,
          value: STATUS_LABEL[r.status] ?? r.status,
        })),
        link: { href: '/requests', label: 'Open my applications' },
      });
    }

    case 'request_status': {
      const list = await mine();
      if (!list.length)
        return reply({
          text: 'There is nothing to track yet — you have not applied for anything. Shall I take you through an application?',
          options: [{ value: 'apply', label: 'Apply now' }],
        });

      const ref = referenceFrom(question);
      const found = ref ? list.find((r) => r.reference === ref) : list[0];

      if (ref && !found)
        return reply({
          text: `I cannot find an application with the reference ${ref} on your record. Check the reference, or ask me to show all your applications.`,
          suggestions: ['Show my applications'],
        });

      const r = found!;
      return reply({
        text: await worded(
          ref
            ? `${r.reference}, your ${fundName(r)} application, is ${STATUS_WORD[r.status]}.`
            : `Your most recent application is ${r.reference} for ${fundName(r)}, and it is ${STATUS_WORD[r.status]}.`,
          { application: brief(r), note: r.admin_note ?? null }
        ),
        figures: [
          { label: 'Reference', value: r.reference },
          { label: 'Fund', value: fundName(r) },
          { label: 'Status', value: STATUS_LABEL[r.status] ?? r.status },
          {
            label: r.status === 'transferred' ? 'Paid' : 'Amount',
            value: money(settled(r)),
          },
          { label: 'Applied', value: dayLabel(r.created_at) },
        ],
        link: { href: `/requests/${r.id}`, label: 'Open this application' },
      });
    }

    case 'why_rejected': {
      const list = await mine();
      const r = list.find((x) => x.status === 'rejected');
      if (!r)
        return reply({
          text: 'None of your applications has been rejected. Would you like to see where they have got to instead?',
          suggestions: ['What is the status of my application?'],
        });

      return reply({
        text: r.admin_note
          ? `${r.reference}, your ${fundName(r)} application, was not approved. The committee gave this reason: “${r.admin_note}”. You are welcome to apply again.`
          : `${r.reference}, your ${fundName(r)} application, was not approved, and no reason was recorded against it. The office can tell you more, and you are welcome to apply again.`,
        figures: [
          { label: 'Reference', value: r.reference },
          { label: 'Decided', value: dayLabel(r.updated_at) },
        ],
        link: { href: `/requests/${r.id}`, label: 'Open this application' },
      });
    }

    case 'money_received': {
      const list = await mine();
      const paid = list.filter((r) => r.status === 'transferred');
      const total = paid.reduce((s, r) => s + settled(r), 0);

      if (!paid.length)
        return reply({
          text: 'Nothing has been transferred to you yet. When it is, I will be able to show you the amount and the date, and a receipt is emailed to you at the same time.',
          suggestions: ['What is the status of my application?'],
        });

      return reply({
        text: await worded(
          `You have received ${money(total)} in total, across ${paid.length} transfer${paid.length === 1 ? '' : 's'}. The most recent was ${money(settled(paid[0]))} for ${fundName(paid[0])} on ${dayLabel(paid[0].transferred_at)}.`,
          { total_received_pkr: total, transfers: paid.map(brief) }
        ),
        figures: [
          { label: 'Received in total', value: money(total) },
          { label: 'Transfers', value: String(paid.length) },
          { label: 'Most recent', value: dayLabel(paid[0].transferred_at) },
        ],
        link: { href: '/requests', label: 'Open my applications' },
      });
    }

    case 'receipt': {
      const list = await mine();
      const paid = list.filter((r) => r.status === 'transferred');
      if (!paid.length)
        return reply({
          text: 'There is no receipt yet — a receipt is issued when money is transferred to you. It is attached to the application and emailed to you at the same time.',
          suggestions: ['What is the status of my application?'],
        });

      const r = paid[0];
      return reply({
        text: `Your most recent receipt is for ${r.reference} — ${money(settled(r))} for ${fundName(r)}, paid on ${dayLabel(r.transferred_at)}. Open the application to see it, and it was also emailed to you.`,
        link: { href: `/requests/${r.id}`, label: 'Open the receipt' },
      });
    }

    case 'my_bank': {
      if (!bankOnFile)
        return reply({
          text: 'You do not have bank details on file yet, and they are needed before you can apply — that is where an approved grant is sent. You need the bank name, the account title and the account number.',
          link: { href: '/profile', label: 'Add my bank details' },
        });

      const tail = (me.bank_account_number ?? '').slice(-4);
      return reply({
        text: `Your bank details are on file: ${me.bank_name}, in the name of ${me.bank_account_title}, account ending ${tail}. You can change them on your profile at any time.`,
        link: { href: '/profile', label: 'Open my profile' },
      });
    }
  }

  /* ================================================================ *
   * How the portal works                                             *
   * ================================================================ */

  const guidance = await howItWorks(topic, question);
  if (guidance) return reply(guidance);

  /* ================================================================ *
   * Nothing matched                                                   *
   * ================================================================ */

  // The model gets a last look, but only at the written description — it can
  // word an answer it finds there and cannot invent a feature.
  if (geminiReady()) {
    const said = await explain(question, MEMBER_GUIDE, 'member', locale);
    if (said) return reply({ text: said, suggestions: MEMBER_FALLBACK });
  }

  return reply({
    text: `I did not quite follow that, ${firstName}. I can explain how to apply, show you where your applications have got to, tell you what documents a fund needs, or start an application with you. You can also ring the office from the Help screen.`,
    suggestions: MEMBER_FALLBACK,
    link: { href: '/help', label: 'Open Help' },
  });

  /* ================================================================ *
   * Helpers that need the request's data in scope                     *
   * ================================================================ */

  /** A short, safe summary of one application — what the model may see. */
  function brief(r: FundRequest) {
    return {
      reference: r.reference,
      fund: fundName(r),
      status: STATUS_LABEL[r.status] ?? r.status,
      amount_pkr: settled(r),
      applied: dayLabel(r.created_at),
      paid: r.status === 'transferred' ? dayLabel(r.transferred_at) : null,
    };
  }

  /**
   * Let the model reword a sentence that is already true.
   *
   * It is handed the figures the application established and never the
   * database, so the worst it can do is phrase something clumsily. Any failure
   * at all — no key, quota spent, slow network — falls back to the sentence
   * written here.
   */
  async function worded(fallback: string, facts: unknown): Promise<string> {
    if (!geminiReady()) return fallback;
    const said = await phrase(question, facts, locale);
    return said || fallback;
  }

  /* ---------------- guidance ---------------- */

  async function howItWorks(t: string, asked: string): Promise<Answer | null> {
    const list = await funds();

    switch (t) {
      case 'how_to_apply':
      case 'apply_now':
        return {
          text: bankOnFile
            ? 'Applying takes four steps: choose the fund you need, enter the amount, say in a sentence what it is for, and attach anything that supports it — a bill, a report, a fee voucher. You then get a reference, and I can tell you where it has got to at any time. Press the round + button at the bottom of the screen, or I can take you through it here.'
            : 'Before you can apply, your bank details need to be on file — that is where an approved grant is sent. Once they are saved, applying takes four steps: choose a fund, enter the amount, say what it is for, and attach anything that supports it.',
          options: bankOnFile
            ? [{ value: 'apply', label: 'Take me through it' }]
            : [{ value: 'bank', label: 'Add my bank details' }],
          link: bankOnFile
            ? { href: '/help', label: 'See the full process' }
            : { href: '/profile', label: 'Open my profile' },
        };

      case 'funds_list': {
        if (!list.length)
          return {
            text: 'There are no funds open for applications at the moment. The office can tell you when that changes.',
            link: { href: '/help', label: 'Contact the office' },
          };
        return {
          text: `There ${list.length === 1 ? 'is 1 fund' : `are ${list.length} funds`} you can apply to. Each has its own purpose and its own limits.`,
          figures: list.map((f) => ({
            label: f.name,
            value: f.max_amount
              ? `${money(Number(f.min_amount), false)}–${money(Number(f.max_amount), false)}`
              : `from ${money(Number(f.min_amount), false)}`,
          })),
          link: { href: '/', label: 'See the funds' },
          options: [{ value: 'apply', label: 'Apply to one' }],
        };
      }

      case 'fund_limits': {
        const named = list.find((f) => matchesFund(asked, f));
        if (named)
          return {
            text: `${named.name}: the smallest application is ${money(Number(named.min_amount))}${
              named.max_amount ? `, and the largest is ${money(Number(named.max_amount))}` : ', with no upper limit set'
            }. ${named.document_required ? 'It will not accept an application without a supporting document.' : 'A supporting document is welcome but not required.'}`,
            link: { href: '/', label: 'See the funds' },
            options: [{ value: 'apply', label: 'Apply to this fund' }],
          };

        return {
          text: 'Each fund sets its own smallest and largest amount, so it depends which one you need. Here they are.',
          figures: list.map((f) => ({
            label: f.name,
            value: f.max_amount
              ? `${money(Number(f.min_amount), false)}–${money(Number(f.max_amount), false)}`
              : `from ${money(Number(f.min_amount), false)}`,
          })),
          link: { href: '/', label: 'See the funds' },
        };
      }

      case 'documents_needed': {
        const must = list.filter((f) => f.document_required);
        return {
          text: must.length
            ? `It depends on the fund. ${must.map((f) => f.name).join(', ')} will not accept an application without a supporting document — a bill, a report or a voucher, whichever fits. For the others a document is welcome and makes the application easier to approve, but it is not required. A clear photograph taken with your phone is fine.`
            : 'No fund requires a document, but attaching one — a bill, a report, a fee voucher — makes an application much easier for the committee to approve. A clear photograph taken with your phone is fine.',
          figures: list.map((f) => ({
            label: f.name,
            value: f.document_required ? `${f.document_label} — required` : f.document_label || 'optional',
          })),
          options: [{ value: 'attach', label: 'Attach one now' }],
        };
      }

      case 'how_long':
        return {
          text: 'There is no fixed number of days, and I would rather not guess at one. An application moves when the committee looks at it: first to review, then to a decision, and then the transfer. You are emailed at each of those points, and you can ask me where yours has got to at any time.',
          suggestions: ['What is the status of my application?'],
        };

      case 'statuses':
        return {
          text: 'There are five. Requested means it is in the queue. Under review means the committee is considering it. Approved means they have agreed, though the money has not moved yet. Transferred means it has been sent and a receipt issued. Rejected means it could not be approved this time, and the reason is shown on the application.',
          figures: [
            { label: 'Requested', value: 'In the queue' },
            { label: 'Under review', value: 'Being considered' },
            { label: 'Approved', value: 'Agreed, not yet paid' },
            { label: 'Transferred', value: 'Paid, receipt issued' },
            { label: 'Rejected', value: 'Not approved' },
          ],
          link: { href: '/requests', label: 'Open my applications' },
        };

      case 'monthly_funds': {
        const monthly = list.filter((f) => f.is_recurring);
        return {
          text: monthly.length
            ? `${monthly.map((f) => f.name).join(' and ')} ${monthly.length === 1 ? 'is a monthly fund' : 'are monthly funds'}. Once an application to one of them is approved, the following months are raised for you automatically at the same amount — you do not have to apply again. Each month still goes through the same approval.`
            : 'All the funds here are one-off: you apply each time you need help, and nothing is raised automatically.',
          link: { href: '/', label: 'See the funds' },
        };
      }

      case 'bank_details':
        return {
          text: 'Your bank details go on your profile: the bank name, the account title and the account number. That is where an approved grant is transferred, so they have to be on file before you can apply, and you can change them there at any time.',
          link: { href: '/profile', label: 'Open my profile' },
        };

      case 'profile_change':
        return {
          text: 'Your name, age, city, mobile number, bank details and family details are all on your profile, and you can correct them yourself. Your email address is the one thing you cannot change here — it is what you sign in with, so the office changes it for you.',
          link: { href: '/profile', label: 'Open my profile' },
        };

      case 'login_help':
        return {
          text: 'There is no password reset in the portal, so a lost password is settled by the office — they will set a new one and give it to you. The Help screen has the helpline number and the office email.',
          link: { href: '/help', label: 'Contact the office' },
        };

      case 'language':
        return {
          text: 'The portal is in English and Urdu. The EN / اردو toggle at the top of the screen switches between them, and it remembers your choice.',
          link: { href: '/profile', label: 'Open my profile' },
        };

      case 'privacy':
        return {
          text: 'Only you and the foundation’s staff can see your applications. Other members cannot see them, cannot see your details, and cannot see what you have received. You also cannot see theirs, or the foundation’s budget and donors — that side of the system is for staff only.',
        };

      case 'contact':
        return {
          text: 'The Help screen has the foundation’s helpline number and the office email address — tap either one and your phone will start the call or the email. Anything I cannot settle, they can.',
          link: { href: '/help', label: 'Open Help' },
        };

      case 'capabilities':
        return {
          text: `I am the foundation’s assistant, ${firstName}. I can explain how anything in this portal works, tell you where your own applications have got to and what you have received, and take you through a new application or attach a document to one you have already made — asking one question at a time. I only ever see your own record.`,
          suggestions: MEMBER_SUGGESTIONS.slice(0, 4),
        };

      default:
        return null;
    }
  }

  function matchesFund(asked: string, f: FundType) {
    const q = ` ${asked.toLowerCase()} `;
    const first = f.name.toLowerCase().split(/\s+/)[0];
    return first.length > 3 && q.includes(first);
  }

  /* ---------------- flows ---------------- */

  async function startApply() {
    if (!bankOnFile)
      return reply({
        text: 'Before we start, your bank details need to be on file — that is where the money would be sent, and an application cannot be made without them. Add them on your profile and come straight back to me.',
        link: { href: '/profile', label: 'Add my bank details' },
      });

    const list = await funds();
    if (!list.length)
      return reply({
        text: 'There are no funds open for applications at the moment, so there is nothing for me to apply to. The office can tell you when that changes.',
        link: { href: '/help', label: 'Contact the office' },
      });

    // A fund named in the opening sentence is an answer already given.
    const named = list.find((f) => matchesFund(question, f));
    if (named) return askAmount(named, { fund: named.id });

    return reply(
      {
        text: 'Of course. Which fund do you need help from?',
        options: list.map((f) => ({ value: f.id, label: f.name })),
      },
      { kind: 'apply', collected: {} }
    );
  }

  async function startAttach() {
    const list = await mine();
    const open = list.filter((r) => r.status !== 'rejected');

    if (!open.length)
      return reply({
        text: 'You have no applications to attach anything to. Shall I take you through a new application instead? You can attach your documents as part of it.',
        options: [{ value: 'apply', label: 'Apply now' }],
      });

    const ref = referenceFrom(question);
    const named = ref ? open.find((r) => r.reference === ref) : null;

    if (named)
      return reply(
        {
          text: `Right — ${named.reference}, your ${fundName(named)} application. Choose the files you want to add and I will file them against it.`,
          wantsFiles: true,
        },
        { kind: 'attach', collected: { request: named.id } }
      );

    if (open.length === 1)
      return reply(
        {
          text: `You have one application open — ${open[0].reference}, for ${fundName(open[0])}. Choose the files you want to add to it.`,
          wantsFiles: true,
        },
        { kind: 'attach', collected: { request: open[0].id } }
      );

    return reply(
      {
        text: 'Certainly. Which application are the documents for?',
        options: open
          .slice(0, 6)
          .map((r) => ({ value: r.id, label: `${r.reference} · ${fundName(r)}` })),
      },
      { kind: 'attach', collected: {} }
    );
  }

  function askAmount(fund: FundType, collected: Record<string, string>) {
    const min = Number(fund.min_amount);
    const max = fund.max_amount ? Number(fund.max_amount) : null;
    return reply(
      {
        text: `${fund.name}. How much do you need? ${
          max
            ? `Anything from ${money(min)} up to ${money(max)}.`
            : `The smallest application is ${money(min)}.`
        }`,
      },
      { kind: 'apply', collected }
    );
  }

  /**
   * One answer inside a flow.
   *
   * Returns null when the answer cannot be used and the flow should be
   * abandoned in favour of ordinary answering — better than a loop that keeps
   * asking a question the member plainly is not trying to answer.
   */
  async function step(
    pending: MemberPending,
    answer: string,
    fileCount: number
  ): Promise<NextResponse | null> {
    const collected = { ...pending.collected };
    const which = nextStep(pending.kind, collected);
    if (!which) return null;

    /* ---------------- attaching ---------------- */
    if (pending.kind === 'attach') {
      if (which === 'request') {
        const list = await mine();
        const picked =
          list.find((r) => r.id === answer) ??
          (referenceFrom(answer) ? list.find((r) => r.reference === referenceFrom(answer)) : null) ??
          list.find((r) => answer && r.reference.toLowerCase() === answer.trim().toLowerCase()) ??
          // The buttons send the label, so match on what a button says too.
          list.find((r) => answer.includes(r.reference));

        if (!picked)
          return reply(
            {
              text: 'I could not tell which application you meant. Please pick one.',
              options: list
                .filter((r) => r.status !== 'rejected')
                .slice(0, 6)
                .map((r) => ({ value: r.id, label: `${r.reference} · ${fundName(r)}` })),
            },
            pending
          );

        collected.request = picked.id;
        return reply(
          {
            text: `${picked.reference} it is. Choose the files you want to add — photographs from your phone are fine.`,
            wantsFiles: true,
          },
          { kind: 'attach', collected }
        );
      }

      if (which === 'files') {
        if (!fileCount)
          return reply(
            {
              text: 'I still need the files. Use the paperclip below to choose them, or say "cancel" to stop.',
              wantsFiles: true,
            },
            pending
          );

        const list = await mine();
        const picked = list.find((r) => r.id === collected.request);
        if (!picked) return null;

        return reply({
          text: `Ready: ${fileCount} file${fileCount === 1 ? '' : 's'} to be added to ${picked.reference}, your ${fundName(picked)} application. Shall I file ${fileCount === 1 ? 'it' : 'them'}?`,
          action: {
            kind: 'attach',
            requestId: picked.id,
            reference: picked.reference,
            fileCount,
          },
        });
      }
    }

    /* ---------------- applying ---------------- */
    const list = await funds();

    if (which === 'fund') {
      const picked =
        list.find((f) => f.id === answer) ??
        list.find((f) => f.name.toLowerCase() === answer.trim().toLowerCase()) ??
        list.find((f) => matchesFund(answer, f));

      if (!picked)
        return reply(
          {
            text: 'I did not catch which fund. Please pick one.',
            options: list.map((f) => ({ value: f.id, label: f.name })),
          },
          pending
        );

      collected.fund = picked.id;
      return askAmount(picked, collected);
    }

    const fund = list.find((f) => f.id === collected.fund);
    if (!fund) return null;

    if (which === 'amount') {
      const amount = readAmount(answer);
      const min = Number(fund.min_amount);
      const max = fund.max_amount ? Number(fund.max_amount) : null;

      if (amount === null)
        return reply({ text: 'How much do you need? Give me a figure, like 5000.' }, pending);
      if (amount < min)
        return reply(
          {
            text: `${fund.name} does not take applications below ${money(min)}. How much shall I put down?`,
          },
          pending
        );
      if (max && amount > max)
        return reply(
          {
            text: `${fund.name} goes up to ${money(max)}, so I cannot ask for ${money(amount)}. What shall I put down?`,
          },
          pending
        );

      collected.amount = String(amount);
      return reply(
        {
          text: `${money(amount)}. What is it for? A sentence is plenty — the committee reads it, and an application that explains itself is easier to approve. Say "skip" if you would rather not.`,
        },
        { kind: 'apply', collected }
      );
    }

    if (which === 'purpose') {
      collected.purpose = isSkip(answer) ? '' : answer.trim();
      return reply(
        {
          text: fund.document_required
            ? `Thank you. ${fund.name} needs a supporting document — ${fund.document_label.toLowerCase()} — so please choose that file now. A clear photograph taken with your phone is fine.`
            : `Thank you. Would you like to attach anything — a bill, a report, a photograph? It is not required for ${fund.name}, so say "skip" if you have nothing to add.`,
          wantsFiles: true,
        },
        { kind: 'apply', collected }
      );
    }

    if (which === 'files') {
      if (!fileCount && fund.document_required && !isSkip(answer))
        return reply(
          {
            text: `${fund.name} will not accept an application without ${fund.document_label.toLowerCase()}. Please choose a file, or say "cancel" to stop.`,
            wantsFiles: true,
          },
          pending
        );

      if (!fileCount && fund.document_required && isSkip(answer))
        return reply(
          {
            text: `I am sorry — ${fund.name} genuinely cannot be applied for without ${fund.document_label.toLowerCase()}. Attach one and I will submit it straight away, or say "cancel" and we will leave it for now.`,
            wantsFiles: true,
          },
          pending
        );

      const amount = Number(collected.amount);
      const purpose = collected.purpose || null;

      return reply({
        text: `Here is your application, ready to go${fileCount ? ` with ${fileCount} file${fileCount === 1 ? '' : 's'} attached` : ''}. Shall I submit it?`,
        figures: [
          { label: 'Fund', value: fund.name },
          { label: 'Amount', value: money(amount) },
          { label: 'Reason', value: purpose || 'not given' },
          { label: 'Attached', value: fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : 'nothing' },
        ],
        action: {
          kind: 'apply',
          fundId: fund.id,
          fundName: fund.name,
          amount,
          purpose,
          fileCount,
        },
      });
    }

    return null;
  }
}
