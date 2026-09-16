import { NextResponse } from 'next/server';
import {
  CAPABILITIES,
  SUGGESTIONS,
  classify,
  isGreeting,
  keywords,
  monthFrom,
  monthLabel,
  rank,
  referenceFrom,
  type Intent,
} from '@/lib/assistant';
import {
  donorActiveFrom,
  isWrite,
  parse,
  statusFrom,
  type Action,
} from '@/lib/assistant-actions';
import {
  FLOWS,
  amountOrNone,
  flowFrom,
  nextField,
  statusFromAnswer,
  suggestPassword,
  type FlowKind,
} from '@/lib/assistant-flows';
import { requireCapability } from '@/lib/admin-guard';
import { can, type Capability } from '@/lib/permissions';
import { explain, geminiReady, phrase, route } from '@/lib/gemini';
import { SYSTEM_GUIDE } from '@/lib/system-guide';
import { getRates, type Rates } from '@/lib/rates';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PK = '+05:00';

/**
 * What the assistant can be asked for, described so a model can match loose
 * wording to one of them. Only the questions a query can answer — explanations
 * and instructions are handled elsewhere.
 */
const ROUTABLE: { id: string; describes: string }[] = [
  { id: 'month_summary', describes: 'how the month is going overall; a summary of everything' },
  { id: 'remaining', describes: 'what is left to spend; the balance; how much money remains' },
  { id: 'donations', describes: 'what came in; money received; how much was donated' },
  { id: 'transferred', describes: 'what went out; money paid to members this month' },
  { id: 'disbursed_total', describes: 'total ever paid out, across all time' },
  { id: 'top_donors', describes: 'who gave, and who gave the most' },
  { id: 'donor_count', describes: 'how many donors gave' },
  { id: 'new_members', describes: 'who registered or joined this month' },
  { id: 'members_total', describes: 'how many members or accounts exist in total' },
  { id: 'missing_bank', describes: 'members with no bank details, who cannot be paid' },
  { id: 'missing_cnic', describes: 'members who have not uploaded a CNIC' },
  { id: 'blocked_members', describes: 'accounts that are blocked' },
  { id: 'pending', describes: 'applications waiting for a decision' },
  { id: 'rejected', describes: 'applications that were refused' },
  { id: 'by_status', describes: 'a breakdown of applications by their stage' },
  { id: 'biggest_request', describes: 'the largest application by amount' },
  { id: 'fund_breakdown', describes: 'the fund types, and activity per fund' },
  { id: 'recurring', describes: 'standing monthly arrangements' },
  { id: 'fx_rate', describes: 'the euro or dollar exchange rate' },
];

interface Answer {
  text: string;
  /** Headline numbers, rendered as chips under the sentence. */
  figures?: { label: string; value: string; pkr?: number }[];
  /** Where to go for the detail behind the answer. */
  link?: { href: string; label: string };
  suggestions?: string[];
  /** Fixed answers for the question just asked, shown as buttons. */
  options?: { value: string; label: string }[];
  /** A change waiting on the administrator to confirm it. Nothing runs until they do. */
  action?: Action;
  /**
   * The figures this answer rests on, in machine form. Handed to the language
   * model when one is configured so it can word the reply without ever being
   * the source of a number. Never sent to the browser.
   */
  facts?: Record<string, unknown>;
}

/**
 * POST /api/admin/assistant — answer a question about the foundation's own data.
 *
 * Every figure here is read live from Postgres. Nothing is cached, because the
 * one thing worse than a slow answer about a balance is a confident stale one.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: me } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin')
    return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  let body: {
    question?: string;
    /** A guided instruction already under way. */
    pending?: { kind: FlowKind; collected: Record<string, string> };
    /** The application this conversation was last about, so "it" means something. */
    context?: { reference?: string | null; memberId?: string | null; memberName?: string | null };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const question = (body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Ask me something.' }, { status: 422 });

  /*
   * Say hello back, by name. It costs one branch and no query, and a box that
   * answers "hi" with a list of things it cannot do reads as broken.
   */
  if (isGreeting(question)) {
    const first = (me.full_name ?? '').trim().split(' ')[0] || 'there';
    const hour = Number(
      new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Karachi' })
    );
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return NextResponse.json({
      intent: 'greeting',
      month: monthFrom(question).month,
      answer: {
        text: `${part}, ${first}. Ask me anything about the foundation — or tell me something to change and I will show you what I am about to do first.`,
        suggestions: SUGGESTIONS.slice(0, 3),
      },
    });
  }

  const { month, explicit } = monthFrom(question);
  const label = monthLabel(month);
  const when = explicit ? `in ${label}` : `this month (${label})`;

  /*
   * Started now, awaited only once the answer actually needs it. The rate
   * provider is a third party over the public internet — measured at 1.4s on a
   * cold instance — and none of the database work depends on it, so waiting
   * here used to add that to every single question. A write proposal never
   * touches it at all and now never waits for it.
   */
  const ratesPromise = getRates();
  let rates: Rates | null = null;

  const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-GB')}`;
  const withFx = (n: number) => {
    if (!rates || n === 0) return pkr(n);
    const eur = (n * rates.eur).toLocaleString('en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: n * rates.eur >= 100 ? 0 : 2,
    });
    const usd = (n * rates.usd).toLocaleString('en-GB', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: n * rates.usd >= 100 ? 0 : 2,
    });
    return `${pkr(n)} (≈ ${eur} · ${usd})`;
  };

  const monthStart = month;
  const next = new Date(`${month}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const monthEnd = next.toISOString().slice(0, 10);

  const budget = async () => {
    const { data } = await supabase.rpc('budget_status', { p_month: monthStart });
    return (data ?? {}) as {
      donated?: number;
      donors?: number;
      spent?: number;
      transfers?: number;
      remaining?: number;
      committed?: number;
    };
  };

  /* ------------------------------------------------------------------ *
   * Instructions that take more than one sentence.                      *
   *                                                                     *
   * "Add a new member" cannot be answered in one step, so the assistant  *
   * asks for each detail in turn. The answers travel in the conversation *
   * rather than being stored here, and nothing reaches the database      *
   * until the last one is in and the administrator confirms.             *
   *                                                                     *
   * Placed after the month and currency helpers above, not before them:  *
   * step() reads both, and running it any earlier reaches them inside    *
   * the temporal dead zone — which throws, and a throw here returns an   *
   * empty body that the browser cannot parse as JSON.                    *
   * ------------------------------------------------------------------ */
  const startKind = flowFrom(question);
  const carried = referenceFrom(question) ?? body.context?.reference ?? undefined;

  const started =
    body.pending ??
    (startKind
      ? {
          kind: startKind,
          // Skip the reference question when the conversation already names one.
          collected:
            startKind === 'add_donor'
              ? body.context?.memberName
                ? { member: body.context.memberName }
                : {}
              : carried && startKind !== 'create_member'
                ? { reference: carried }
                : {},
        }
      : null);

  if (started) {
    const writeGate = await requireCapability('use_assistant_writes');
    if ('refusal' in writeGate)
      return NextResponse.json({
        intent: 'help',
        month,
        answer: {
          text: 'Your administrator account can ask me about the figures, but cannot change anything.',
          suggestions: SUGGESTIONS.slice(0, 3),
        },
      });

    const out = await step(started, body.pending ? question : null);
    return NextResponse.json({ ...out, context: { reference: carried ?? null } });
  }

  /* ------------------------------------------------------------------ *
   * What is this question about?                                        *
   *                                                                     *
   * An intent covers the recurring questions. A subject covers the rest: *
   * anything that names a person, a fund or an application is answered  *
   * about that thing, whatever words surround it.                       *
   * ------------------------------------------------------------------ */

  const reference = referenceFrom(question);

  /*
   * An instruction to change something is answered with a proposal, never with
   * a change. Nothing below this line writes; the administrator is shown what
   * would happen and confirms it, which is the only thing that calls /act.
   */
  if (isWrite(question)) {
    // A chat box must not be a way round the permission that applies to every
    // button. A level that cannot approve from the application screen cannot
    // approve by asking for it either.
    const gate = await requireCapability('use_assistant_writes');
    if ('refusal' in gate)
      return NextResponse.json({
        intent: 'help',
        month,
        answer: {
          text: 'Your administrator account can ask me about the figures, but cannot change anything. Ask a master administrator to make that change.',
          suggestions: SUGGESTIONS.slice(0, 4),
        },
      });

    const proposal = await propose(question);
    return NextResponse.json({ intent: 'action', month, answer: proposal });
  }

  /*
   * Reading is gated too, not only writing. An account with no budget module
   * must not be able to ask the balance in a sentence and be told — the chat
   * box would otherwise be a way round every door the levels just closed.
   */
  const NEEDS: Partial<Record<Intent, Capability>> = {
    donations: 'view_budget',
    transferred: 'view_budget',
    remaining: 'view_budget',
    month_summary: 'view_budget',
    disbursed_total: 'view_budget',
    fx_rate: 'view_budget',
    donor_count: 'view_donors',
    top_donors: 'view_donors',
    pending: 'view_requests',
    by_status: 'view_requests',
    biggest_request: 'view_requests',
    rejected: 'view_requests',
    fund_breakdown: 'view_requests',
    request_lookup: 'view_requests',
    recurring: 'view_requests',
  };

  const readGate = await requireCapability('view_dashboard');
  if ('refusal' in readGate) return readGate.refusal;
  const level = readGate.level;

  let intent: Intent = classify(question);

  type Person = { id: string; full_name: string; email: string };
  let person: Person | null = null;
  let alsoMatched: string[] = [];
  let fundId: string | null = null;
  let fundName = '';

  if (reference) {
    intent = 'request_lookup';
  } else {
    const words = keywords(question);

    // Only worth a lookup if anything survived the grammar strip.
    if (words.length) {
      const { data: people } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .limit(2000);

      const hits = rank(
        question,
        ((people ?? []) as Person[]).map((p) => ({
          id: p.id,
          name: p.full_name,
          aliases: [p.email.split('@')[0].replace(/[._-]/g, ' ')],
          row: p,
        }))
      );

      if (hits.length) {
        person = hits[0].item.row;
        intent = 'member_lookup';
        // A tie means two people share the matched name; say so rather than pick.
        alsoMatched = hits
          .filter((h) => h.score === hits[0].score && h.item.row.id !== person!.id)
          .map((h) => h.item.row.full_name);
      } else {
        /*
         * Naming a fund outranks any general reading of the question: "the
         * accidental fund" is about that fund, not about donations at large.
         * Only a fund's distinctive words can match — "fund" and "monthly" are
         * ordinary vocabulary here and are never matched on.
         */
        const { data: funds } = await supabase.from('fund_types').select('id, name');
        const fundHits = rank(question, (funds ?? []) as { id: string; name: string }[]);

        if (fundHits.length) {
          fundId = fundHits[0].item.id;
          fundName = fundHits[0].item.name;
          intent = 'fund_breakdown';
        } else if (intent === 'help' && geminiReady()) {
          /*
           * The rules did not recognise it. Before shrugging, let the model
           * decide which question was meant — this portal is used by people
           * who will not know the words the matcher expects, and "paisa kitna
           * bacha" deserves the balance rather than a list of capabilities.
           *
           * The model picks the question; the answer is still read from the
           * database afterwards. A topic it invents is discarded.
           */
          const routed = await route(question, ROUTABLE);

          if (routed?.smalltalk)
            return NextResponse.json({
              intent: 'smalltalk',
              month,
              answer: { text: routed.smalltalk, suggestions: SUGGESTIONS.slice(0, 3) },
            });

          if (routed?.clarify)
            return NextResponse.json({
              intent: 'clarify',
              month,
              answer: { text: routed.clarify },
            });

          if (routed?.topic) intent = routed.topic as Intent;
          else if (explicit) intent = 'month_summary';
        } else if (intent === 'help' && explicit) {
          // "what happened in March" names a month and nothing else. The month
          // is the subject, so answer for the month rather than shrug.
          intent = 'month_summary';
        }
      }
    }
  }

  const needed = NEEDS[intent];
  if (needed && !can(level, needed))
    return NextResponse.json({
      intent: 'help',
      month,
      answer: {
        text: 'Your administrator account does not have access to that part of the foundation, so I cannot answer it. Ask a master administrator.',
        suggestions: ['How many members are there?', 'How many new members registered this month?'],
      },
    });

  // Overlapped with everything above rather than waited for at the start.
  rates = await ratesPromise;

  const answer = await build(intent);

  /*
   * The model only ever rewrites a sentence we could already produce, from
   * figures we already hold. If it is off, slow or unhappy, the deterministic
   * sentence ships unchanged — so this can fail without the answer failing.
   */
  if (geminiReady() && answer.facts && intent !== 'help') {
    const worded = await phrase(question, { month: label, ...answer.facts });
    if (worded) answer.text = worded;
  }

  delete answer.facts;
  return NextResponse.json({
    intent,
    month,
    answer,
    // Lets the next turn understand it without being told again.
    context: {
      reference: reference ?? body.context?.reference ?? null,
      memberId: person?.id ?? body.context?.memberId ?? null,
      memberName: person?.full_name ?? body.context?.memberName ?? null,
    },
  });

  /**
   * Work out what the administrator is asking to change, and describe it back
   * to them. Every value comes from their own sentence or from a row already
   * in the database — nothing here is inferred, and nothing here is written.
   */
  async function propose(text: string): Promise<Answer> {
    const p = parse(text);
    const ref = referenceFrom(text);

    /*
     * Just the question. This used to carry four worked examples as buttons,
     * naming real members and running the instruction when clicked — offered
     * in the middle of asking for something else entirely.
     */
    const ask = (why: string): Answer => ({ text: why });

    /* ---- an application, named by its reference ---- */
    if (p.kind === 'set_status') {
      if (!ref)
        return ask(
          'Which application? Give me its reference — for example "approve SHF-26-01001 at 5000".'
        );

      const { data } = await supabase
        .from('fund_requests')
        .select('id, reference, status, amount_requested, profiles!fund_requests_user_id_fkey(full_name)')
        .eq('reference', ref)
        .maybeSingle();

      const r = data as unknown as {
        id: string;
        reference: string;
        status: string;
        amount_requested: number;
        profiles: { full_name: string } | null;
      } | null;
      if (!r) return ask(`There is no application with reference ${ref}.`);

      const status = statusFrom(text);
      if (!status) return ask('Approve, reject, or move to review?');
      if (status === 'rejected' && !p.note)
        return ask(
          'A rejection needs a reason — the member is shown it. Try "reject SHF-26-01001 because the documents are incomplete".'
        );

      const amount = status === 'accepted' ? (p.amount ?? Number(r.amount_requested)) : null;
      const who = r.profiles?.full_name ?? 'the member';

      return {
        text:
          status === 'accepted'
            ? `Approve ${r.reference} for ${who} at ${pkr(Number(amount))}?`
            : status === 'rejected'
              ? `Reject ${r.reference} for ${who}, telling them: “${p.note}”?`
              : `Move ${r.reference} for ${who} to review?`,
        figures: [
          { label: 'Requested', value: pkr(Number(r.amount_requested)) },
          { label: 'Currently', value: r.status },
        ],
        action: {
          kind: 'set_status',
          requestId: r.id,
          status,
          note: p.note ?? undefined,
          amount: amount ?? undefined,
          subject: r.reference,
        },
      };
    }

    /* ---- everything else is about a person ---- */
    const { data: people } = await supabase.from('profiles').select('id, full_name, email, is_blocked');
    type P = { id: string; full_name: string; email: string; is_blocked: boolean };

    const hits = rank(
      text,
      ((people ?? []) as P[]).map((x) => ({
        id: x.id,
        name: x.full_name,
        aliases: [x.email.split('@')[0].replace(/[._-]/g, ' ')],
        row: x,
      }))
    );

    /*
     * No name in the sentence. Before asking for one, use whoever the
     * conversation was just about — "add him as a donor", said straight after
     * the assistant described Sadaan Shahid, means Sadaan Shahid. Asking
     * "which member?" one line after naming them reads as not listening.
     */
    if (!hits.length && body.context?.memberId) {
      const remembered = ((people ?? []) as P[]).find((x) => x.id === body.context!.memberId);
      if (remembered)
        hits.push({
          item: { id: remembered.id, name: remembered.full_name, aliases: [], row: remembered },
          score: 1,
        });
    }

    if (!hits.length) return ask('Which member? Give me their name as it is registered.');

    const tied = hits.filter((h) => h.score === hits[0].score);
    if (tied.length > 1)
      return ask(
        `That could be ${tied.map((t) => t.item.row.full_name).join(' or ')}. Which one — use their full name.`
      );

    const person = hits[0].item.row;

    if (p.kind === 'block_member' || p.kind === 'unblock_member') {
      const blocking = p.kind === 'block_member';
      if (person.is_blocked === blocking)
        return ask(`${person.full_name} is already ${blocking ? 'blocked' : 'not blocked'}.`);
      return {
        text: blocking
          ? `Block ${person.full_name}? They will not be able to sign in or apply.`
          : `Unblock ${person.full_name}, so they can sign in and apply again?`,
        action: { kind: p.kind, memberId: person.id, subject: person.full_name },
      };
    }

    if (p.kind === 'set_donor_active') {
      const active = donorActiveFrom(text);

      const { data: row } = await supabase
        .from('donors')
        .select('id, is_active')
        .eq('user_id', person.id)
        .maybeSingle();
      const donor = row as { id: string; is_active: boolean } | null;

      if (!donor)
        return ask(
          `${person.full_name} is not on the donor list, so there is nothing to ${active ? 'activate' : 'deactivate'}. Recording a donation from them adds them to it.`
        );
      if (donor.is_active === active)
        return ask(`${person.full_name} is already ${active ? 'active' : 'inactive'} as a donor.`);

      return {
        text: active
          ? `Put ${person.full_name} back on the donor list?`
          : `Take ${person.full_name} off the donor list? Everything they have already given stays recorded, so no month's fund changes — they simply stop appearing as someone to collect from.`,
        action: {
          kind: 'set_donor_active',
          memberId: person.id,
          active,
          subject: person.full_name,
        },
      };
    }

    if (p.kind === 'set_pledge') {
      if (p.amount === null) return ask(`How much is ${person.full_name} pledging each month?`);
      return {
        text: `Set ${person.full_name}'s monthly pledge to ${pkr(p.amount)}? A pledge is what they said; only a recorded donation adds to the fund.`,
        action: { kind: 'set_pledge', memberId: person.id, amount: p.amount, subject: person.full_name },
      };
    }

    if (p.kind === 'clear_donation') {
      return {
        text: `Remove ${person.full_name}'s donation for ${label}? The month's fund drops by that amount.`,
        action: {
          kind: 'clear_donation',
          memberId: person.id,
          month: monthStart,
          subject: person.full_name,
        },
      };
    }

    /* ---- record a donation ---- */
    if (p.amount === null)
      return ask(`How much did ${person.full_name} give? For example "${person.full_name.split(' ')[0]} donated 5000".`);

    const b = await budget();
    const already = (
      ((await supabase.rpc('donor_month', { p_month: monthStart })).data ?? []) as {
        name: string;
        given: number | null;
      }[]
    ).find((d) => d.name === person.full_name)?.given;

    return {
      text:
        already != null
          ? `${person.full_name} already has ${pkr(Number(already))} recorded for ${label}. Replace it with ${pkr(p.amount)}?`
          : `Record ${pkr(p.amount)} from ${person.full_name} for ${label}?`,
      figures: [
        { label: `Fund now`, value: pkr(Number(b.donated ?? 0)) },
        { label: 'After this', value: pkr(Number(b.donated ?? 0) - Number(already ?? 0) + p.amount) },
      ],
      action: {
        kind: 'record_donation',
        memberId: person.id,
        amount: p.amount,
        month: monthStart,
        subject: person.full_name,
      },
    };
  }

  /**
   * One turn of a guided instruction: take the answer just given, complain if
   * it is no good, and ask for the next thing — or, when everything is in,
   * hand back the same confirm-first proposal a one-line instruction produces.
   */
  async function step(
    state: { kind: FlowKind; collected: Record<string, string> },
    answer: string | null
  ) {
    const flow = FLOWS[state.kind];
    const collected = { ...state.collected };

    if (answer !== null) {
      const field = nextField(flow, collected);
      if (field) {
        const given = answer.trim();

        // An escape hatch, so nobody is trapped halfway through.
        if (/^(cancel|stop|never mind|nevermind|forget it)$/i.test(given))
          return {
            intent: 'flow',
            month: monthStart,
            answer: { text: 'Cancelled — nothing was changed.', suggestions: SUGGESTIONS.slice(0, 3) },
          };

        const value =
          field.key === 'password' && /^suggest/i.test(given) ? suggestPassword() : given;

        const complaint = field.check?.(value);
        if (complaint)
          return {
            intent: 'flow',
            month: monthStart,
            answer: { text: `${complaint} ${field.ask}`, options: field.options },
            pending: state,
          };

        collected[field.key] = value;
      }
    }

    const next = nextField(flow, collected);
    if (next)
      return {
        intent: 'flow',
        month: monthStart,
        answer: {
          text: answer === null ? `${flow.opening} ${next.ask}` : next.ask,
          options: next.options,
        },
        pending: { kind: state.kind, collected },
      };

    /* ---- everything is in; describe what will happen ---- */
    if (state.kind === 'create_member')
      return {
        intent: 'action',
        month: monthStart,
        answer: {
          text: `Create a member account for ${collected.full_name}? They can sign in with ${collected.email} using the password ${collected.password}, which you will need to give them.`,
          figures: [
            { label: 'Name', value: collected.full_name },
            { label: 'City', value: collected.city },
            { label: 'Mobile', value: collected.mobile },
            { label: 'Password', value: collected.password },
          ],
          action: {
            kind: 'create_member',
            subject: collected.full_name,
            member: {
              full_name: collected.full_name,
              gender: collected.gender.toLowerCase(),
              age: Number(collected.age.replace(/\D/g, '')),
              city: collected.city,
              country: 'Pakistan',
              email: collected.email.toLowerCase(),
              mobile: collected.mobile,
              password: collected.password,
            },
          },
        },
      };

    /* ---- putting a member on the donor list ---- */
    if (state.kind === 'add_donor') {
      const { data: people } = await supabase.from('profiles').select('id, full_name, email');
      type P = { id: string; full_name: string; email: string };

      const hits = rank(
        collected.member,
        ((people ?? []) as P[]).map((x) => ({ id: x.id, name: x.full_name, row: x }))
      );

      if (!hits.length)
        return {
          intent: 'flow',
          month: monthStart,
          answer: { text: `I cannot find a member called “${collected.member}”. Try their registered name.` },
        };

      const person = hits[0].item.row;
      const pledge = amountOrNone(collected.pledge);
      const given = amountOrNone(collected.given);

      const parts = [`Add ${person.full_name} to the donor list`];
      if (pledge) parts.push(`with a monthly pledge of ${pkr(pledge)}`);
      if (given) parts.push(`and record ${pkr(given)} received for ${label}`);

      return {
        intent: 'action',
        month: monthStart,
        answer: {
          text: `${parts.join(', ')}?${
            pledge && !given
              ? ' A pledge is what they said; only a recorded donation adds to the fund.'
              : ''
          }`,
          figures: [
            { label: 'Monthly pledge', value: pledge ? pkr(pledge) : '—' },
            { label: `Given in ${label}`, value: given ? pkr(given) : '—' },
          ],
          action: {
            kind: 'add_donor',
            memberId: person.id,
            pledge,
            given,
            month: monthStart,
            subject: person.full_name,
          },
        },
      };
    }

    /* ---- correcting the amount on an application ---- */
    if (state.kind === 'set_amount') {
      const ref = referenceFrom(collected.reference)!;
      const wanted = Number(collected.amount.replace(/[^\d.]/g, ''));

      const { data } = await supabase
        .from('fund_requests')
        .select('id, reference, status, amount_requested, profiles!fund_requests_user_id_fkey(full_name)')
        .eq('reference', ref)
        .maybeSingle();

      const r = data as unknown as {
        id: string;
        reference: string;
        status: string;
        amount_requested: number;
        profiles: { full_name: string } | null;
      } | null;

      if (!r)
        return {
          intent: 'flow',
          month: monthStart,
          answer: { text: `There is no application with reference ${ref}.` },
        };

      if (r.status === 'transferred')
        return {
          intent: 'flow',
          month: monthStart,
          answer: {
            text: `${r.reference} has already been transferred, so its amount cannot be changed — the record has to match the receipt the member was given.`,
          },
        };

      return {
        intent: 'action',
        month: monthStart,
        answer: {
          text: `Change ${r.reference} for ${r.profiles?.full_name ?? 'the member'} from ${pkr(Number(r.amount_requested))} to ${pkr(wanted)}?`,
          figures: [
            { label: 'Currently asks for', value: pkr(Number(r.amount_requested)) },
            { label: 'Will ask for', value: pkr(wanted) },
          ],
          action: {
            kind: 'set_requested_amount',
            requestId: r.id,
            amount: wanted,
            subject: r.reference,
          },
        },
      };
    }

    /* ---- a status change, resolved against the real application ---- */
    const ref = referenceFrom(collected.reference)!;
    const status = statusFromAnswer(collected.status)!;

    const { data } = await supabase
      .from('fund_requests')
      .select('id, reference, status, amount_requested, profiles!fund_requests_user_id_fkey(full_name)')
      .eq('reference', ref)
      .maybeSingle();

    const r = data as unknown as {
      id: string;
      reference: string;
      status: string;
      amount_requested: number;
      profiles: { full_name: string } | null;
    } | null;

    if (!r)
      return {
        intent: 'flow',
        month: monthStart,
        answer: { text: `There is no application with reference ${ref}.`, suggestions: SUGGESTIONS.slice(0, 3) },
      };

    const asked = Number(r.amount_requested);
    const approved =
      status === 'accepted'
        ? /as requested|same|yes/i.test(collected.amount ?? '')
          ? asked
          : (Number((collected.amount ?? '').replace(/[^\d.]/g, '')) || asked)
        : null;

    const who = r.profiles?.full_name ?? 'the member';

    return {
      intent: 'action',
      month: monthStart,
      answer: {
        text:
          status === 'accepted'
            ? `Approve ${r.reference} for ${who} at ${pkr(approved!)}?`
            : status === 'rejected'
              ? `Reject ${r.reference} for ${who}, telling them: “${collected.note}”?`
              : `Move ${r.reference} for ${who} to review?`,
        figures: [
          { label: 'Requested', value: pkr(asked) },
          { label: 'Currently', value: r.status },
        ],
        action: {
          kind: 'set_status',
          requestId: r.id,
          status,
          note: collected.note,
          amount: approved ?? undefined,
          subject: r.reference,
        },
      },
    };
  }

  async function build(kind: Intent): Promise<Answer> {
    switch (kind) {
      case 'donations': {
        const b = await budget();
        const total = Number(b.donated ?? 0);
        return {
          text: total
            ? `You received ${withFx(total)} ${when}, from ${b.donors} donor${b.donors === 1 ? '' : 's'}. That is the whole of the month's fund — nothing else adds to it.`
            : `No donations are recorded ${when} yet, so the month's fund is zero and no transfers can be made until one is.`,
          figures: [{ label: `Received ${label}`, value: pkr(total), pkr: total }],
          link: { href: '/admin/budget', label: 'Open the budget' },
          facts: { received_pkr: total, donors_who_gave: Number(b.donors ?? 0) },
        };
      }

      case 'transferred': {
        const b = await budget();
        const total = Number(b.spent ?? 0);
        return {
          text: total
            ? `You transferred ${withFx(total)} ${when}, across ${b.transfers} transfer${b.transfers === 1 ? '' : 's'}.`
            : `Nothing has been transferred ${when}.`,
          figures: [{ label: `Transferred ${label}`, value: pkr(total), pkr: total }],
          link: { href: '/admin/requests?status=transferred', label: 'See the transfers' },
          facts: { transferred_pkr: total, number_of_transfers: Number(b.transfers ?? 0) },
        };
      }

      case 'remaining': {
        const b = await budget();
        const left = Number(b.remaining ?? 0);
        const committed = Number(b.committed ?? 0);
        const tail = committed > 0 ? ` ${pkr(committed)} is approved and still waiting to be paid.` : '';
        return {
          text:
            left > 0
              ? `${withFx(left)} is left in the ${label} fund — ${pkr(Number(b.donated ?? 0))} received less ${pkr(Number(b.spent ?? 0))} transferred.${tail}`
              : `Nothing is left in the ${label} fund. Record a donation before approving any more transfers.${tail}`,
          figures: [
            { label: 'Received', value: pkr(Number(b.donated ?? 0)) },
            { label: 'Transferred', value: pkr(Number(b.spent ?? 0)) },
            { label: 'Remaining', value: pkr(left), pkr: left },
          ],
          link: { href: '/admin/budget', label: 'Open the budget' },
          facts: {
            received_pkr: Number(b.donated ?? 0),
            transferred_pkr: Number(b.spent ?? 0),
            remaining_pkr: left,
            approved_but_not_yet_paid_pkr: committed,
          },
        };
      }

      case 'month_summary': {
        // Three independent questions; asking them one after another cost a
        // round trip each for no reason.
        const [b, { count: joined }, { count: waiting }] = await Promise.all([
          budget(),
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', `${monthStart}T00:00:00.000${PK}`)
            .lt('created_at', `${monthEnd}T00:00:00.000${PK}`),
          supabase
            .from('fund_requests')
            .select('*', { count: 'exact', head: true })
            .in('status', ['requested', 'review']),
        ]);

        const left = Number(b.remaining ?? 0);
        return {
          text: `${label}: ${pkr(Number(b.donated ?? 0))} in from ${b.donors ?? 0} donor${b.donors === 1 ? '' : 's'}, ${pkr(Number(b.spent ?? 0))} out across ${b.transfers ?? 0} transfer${b.transfers === 1 ? '' : 's'}, leaving ${withFx(left)}. ${joined ?? 0} new member${joined === 1 ? '' : 's'} registered and ${waiting ?? 0} application${waiting === 1 ? ' is' : 's are'} waiting on the committee.`,
          figures: [
            { label: 'Received', value: pkr(Number(b.donated ?? 0)) },
            { label: 'Transferred', value: pkr(Number(b.spent ?? 0)) },
            { label: 'Remaining', value: pkr(left), pkr: left },
            { label: 'New members', value: String(joined ?? 0) },
            { label: 'Awaiting', value: String(waiting ?? 0) },
          ],
          link: { href: '/admin/budget', label: 'Open the budget' },
          facts: {
            received_pkr: Number(b.donated ?? 0),
            donors_who_gave: Number(b.donors ?? 0),
            transferred_pkr: Number(b.spent ?? 0),
            number_of_transfers: Number(b.transfers ?? 0),
            remaining_pkr: left,
            new_members_this_month: joined ?? 0,
            applications_awaiting_committee: waiting ?? 0,
          },
        };
      }

      case 'new_members': {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', `${monthStart}T00:00:00.000${PK}`)
          .lt('created_at', `${monthEnd}T00:00:00.000${PK}`);
        const n = count ?? 0;
        return {
          text: n
            ? `${n} account${n === 1 ? '' : 's'} registered ${when}.`
            : `Nobody new registered ${when}.`,
          figures: [{ label: `New ${label}`, value: String(n) }],
          link: { href: '/admin/members', label: 'See the members' },
          facts: { new_registrations: n },
        };
      }

      case 'members_total': {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        const { count: admins } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin');
        return {
          text: `There are ${count ?? 0} accounts in total, ${admins ?? 0} of them administrators.`,
          figures: [
            { label: 'Accounts', value: String(count ?? 0) },
            { label: 'Administrators', value: String(admins ?? 0) },
          ],
          link: { href: '/admin/members', label: 'See the members' },
          facts: { total_accounts: count ?? 0, administrators: admins ?? 0 },
        };
      }

      case 'donor_count': {
        const [b, { data: all }] = await Promise.all([
          budget(),
          supabase.rpc('donor_month', { p_month: monthStart }),
        ]);
        const list = (all ?? []) as { given: number | null }[];
        const gave = Number(b.donors ?? 0);
        return {
          text: gave
            ? `${gave} of ${list.length} donor${list.length === 1 ? '' : 's'} gave ${when}, ${withFx(Number(b.donated ?? 0))} between them.`
            : `None of your ${list.length} donor${list.length === 1 ? '' : 's'} has given ${when} yet.`,
          figures: [
            { label: 'Gave', value: String(gave) },
            { label: 'On the list', value: String(list.length) },
          ],
          link: { href: '/admin/budget', label: 'Open the donors' },
          facts: { donors_who_gave: gave, donors_on_the_list: list.length, received_pkr: Number(b.donated ?? 0) },
        };
      }

      case 'top_donors': {
        const { data: all } = await supabase.rpc('donor_month', { p_month: monthStart });
        const list = ((all ?? []) as { name: string; given: number | null }[])
          .filter((d) => d.given != null)
          .sort((a, b2) => Number(b2.given) - Number(a.given))
          .slice(0, 5);

        if (!list.length)
          return {
            text: `Nobody has given ${when}, so there is no ranking to show.`,
            link: { href: '/admin/budget', label: 'Open the donors' },
            facts: { donations_this_month: [] },
          };

        return {
          text: `The largest donations ${when}:`,
          figures: list.map((d) => ({
            label: d.name,
            value: pkr(Number(d.given)),
            pkr: Number(d.given),
          })),
          link: { href: '/admin/budget', label: 'Open the donors' },
          facts: {
            donations_this_month: list.map((d) => ({ donor: d.name, given_pkr: Number(d.given) })),
          },
        };
      }

      case 'pending': {
        const { count: requested } = await supabase
          .from('fund_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'requested');
        const { count: review } = await supabase
          .from('fund_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'review');
        const total = (requested ?? 0) + (review ?? 0);
        return {
          text: total
            ? `${total} application${total === 1 ? '' : 's'} are waiting on the committee — ${requested ?? 0} newly requested and ${review ?? 0} under review.`
            : 'Nothing is waiting on the committee.',
          figures: [
            { label: 'Requested', value: String(requested ?? 0) },
            { label: 'Under review', value: String(review ?? 0) },
          ],
          link: { href: '/admin/requests?status=requested', label: 'Review them' },
          facts: { newly_requested: requested ?? 0, under_review: review ?? 0, total_waiting: total },
        };
      }

      case 'rejected': {
        const { data, count } = await supabase
          .from('fund_requests')
          .select('reference, amount_requested, admin_note, profiles!fund_requests_user_id_fkey(full_name)', { count: 'exact' })
          .eq('status', 'rejected')
          .order('updated_at', { ascending: false })
          .limit(5);

        const rows = (data ?? []) as unknown as {
          reference: string;
          amount_requested: number;
          admin_note: string | null;
          profiles: { full_name: string } | null;
        }[];

        return {
          text: count
            ? `${count} application${count === 1 ? ' has' : 's have'} been rejected. The most recent:`
            : 'No application has been rejected.',
          figures: rows.map((r) => ({
            label: `${r.profiles?.full_name ?? 'Member'} · ${r.reference}`,
            value: pkr(Number(r.amount_requested)),
          })),
          link: { href: '/admin/requests?status=rejected', label: 'See them' },
          facts: {
            total_rejected: count ?? 0,
            most_recent: rows.map((r) => ({
              reference: r.reference,
              member: r.profiles?.full_name ?? null,
              amount_requested_pkr: Number(r.amount_requested),
              reason: r.admin_note,
            })),
          },
        };
      }

      case 'biggest_request': {
        const { data } = await supabase
          .from('fund_requests')
          .select('reference, amount_requested, amount_approved, status, profiles!fund_requests_user_id_fkey(full_name), fund_types(name)')
          .order('amount_requested', { ascending: false })
          .limit(5);

        const rows = (data ?? []) as unknown as {
          reference: string;
          amount_requested: number;
          amount_approved: number | null;
          status: string;
          profiles: { full_name: string } | null;
          fund_types: { name: string } | null;
        }[];

        if (!rows.length) return { text: 'There are no applications yet.', facts: { applications: [] } };

        const top = rows[0];
        return {
          text: `The largest application on record is ${top.reference} — ${withFx(Number(top.amount_requested))} for ${top.fund_types?.name ?? 'a fund'}, from ${top.profiles?.full_name ?? 'a member'}, currently ${top.status}.`,
          figures: rows.map((r) => ({
            label: `${r.profiles?.full_name ?? 'Member'} · ${r.reference}`,
            value: pkr(Number(r.amount_requested)),
            pkr: Number(r.amount_requested),
          })),
          link: { href: '/admin/requests', label: 'Open applications' },
          facts: {
            largest_applications: rows.map((r) => ({
              reference: r.reference,
              member: r.profiles?.full_name ?? null,
              fund: r.fund_types?.name ?? null,
              amount_requested_pkr: Number(r.amount_requested),
              amount_approved_pkr: r.amount_approved === null ? null : Number(r.amount_approved),
              status: r.status,
            })),
          },
        };
      }

      case 'by_status': {
        const names = ['requested', 'review', 'accepted', 'transferred', 'rejected'] as const;
        const counts = await Promise.all(
          names.map(async (s) => {
            const { count } = await supabase
              .from('fund_requests')
              .select('*', { count: 'exact', head: true })
              .eq('status', s);
            return { label: s[0].toUpperCase() + s.slice(1), value: String(count ?? 0) };
          })
        );
        const total = counts.reduce((sum, c) => sum + Number(c.value), 0);
        return {
          text: total
            ? `${total} application${total === 1 ? '' : 's'} in all, by where they have got to:`
            : 'There are no applications yet.',
          figures: counts,
          link: { href: '/admin/requests', label: 'Open applications' },
          facts: {
            total_applications: total,
            by_status: Object.fromEntries(counts.map((c) => [c.label.toLowerCase(), Number(c.value)])),
          },
        };
      }

      case 'fund_breakdown': {
        const [{ data: funds }, { data: reqs }] = await Promise.all([
          supabase
            .from('fund_types')
            .select('id, name, min_amount, max_amount, is_active')
            .order('sort_order'),
          supabase
            .from('fund_requests')
            .select('fund_type_id, status, amount_requested, amount_approved'),
        ]);
        const list = (funds ?? []) as {
          id: string;
          name: string;
          min_amount: number;
          max_amount: number | null;
          is_active: boolean;
        }[];

        const scope = fundId ? list.filter((f) => f.id === fundId) : list;

        const rows = (reqs ?? []) as {
          fund_type_id: string;
          status: string;
          amount_requested: number;
          amount_approved: number | null;
        }[];

        const per = scope.map((f) => {
          const mine = rows.filter((r) => r.fund_type_id === f.id);
          const paid = mine
            .filter((r) => r.status === 'transferred')
            .reduce((s, r) => s + Number(r.amount_approved ?? r.amount_requested), 0);
          return { fund: f.name, applications: mine.length, transferred_pkr: paid, active: f.is_active };
        });

        return {
          text: fundId
            ? `${fundName}: ${per[0]?.applications ?? 0} application${per[0]?.applications === 1 ? '' : 's'} in total, ${withFx(per[0]?.transferred_pkr ?? 0)} transferred against it.`
            : `Applications and money paid out, by fund:`,
          figures: per.map((p) => ({
            label: `${p.fund} · ${p.applications} application${p.applications === 1 ? '' : 's'}`,
            value: pkr(p.transferred_pkr),
            pkr: p.transferred_pkr,
          })),
          link: { href: '/admin/funds', label: 'Open the funds' },
          facts: { funds: per },
        };
      }

      case 'missing_bank': {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, email, bank_account_number')
          .eq('role', 'member');

        if (error)
          return { text: 'Bank details need migration 0007. Run supabase/SETUP.sql and ask me again.' };

        const rows = (data ?? []) as { full_name: string; email: string; bank_account_number: string | null }[];
        const missing = rows.filter((r) => !r.bank_account_number);

        return {
          text: missing.length
            ? `${missing.length} of ${rows.length} member${rows.length === 1 ? '' : 's'} have no bank details on file, so nothing can be transferred to them until they add some.`
            : `Every one of your ${rows.length} member${rows.length === 1 ? ' has' : 's have'} bank details on file.`,
          figures: missing.slice(0, 8).map((m) => ({ label: m.full_name, value: 'No bank' })),
          link: { href: '/admin/members', label: 'See the members' },
          facts: {
            members_total: rows.length,
            members_without_bank_details: missing.length,
            names: missing.slice(0, 20).map((m) => m.full_name),
          },
        };
      }

      case 'missing_cnic': {
        const { data } = await supabase.from('profiles').select('full_name, nic_path').eq('role', 'member');
        const rows = (data ?? []) as { full_name: string; nic_path: string | null }[];
        const missing = rows.filter((r) => !r.nic_path);

        return {
          text: missing.length
            ? `${missing.length} of ${rows.length} member${rows.length === 1 ? '' : 's'} have not uploaded a CNIC.`
            : `All ${rows.length} member${rows.length === 1 ? ' has' : 's have'} a CNIC on file.`,
          figures: missing.slice(0, 8).map((m) => ({ label: m.full_name, value: 'No CNIC' })),
          link: { href: '/admin/members', label: 'See the members' },
          facts: {
            members_total: rows.length,
            members_without_cnic: missing.length,
            names: missing.slice(0, 20).map((m) => m.full_name),
          },
        };
      }

      case 'blocked_members': {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('is_blocked', true);
        const rows = (data ?? []) as { full_name: string; email: string }[];
        return {
          text: rows.length
            ? `${rows.length} account${rows.length === 1 ? ' is' : 's are'} blocked. They cannot sign in or apply.`
            : 'No account is blocked.',
          figures: rows.slice(0, 8).map((r) => ({ label: r.full_name, value: 'Blocked' })),
          link: { href: '/admin/members', label: 'See the members' },
          facts: { blocked_accounts: rows.length, names: rows.map((r) => r.full_name) },
        };
      }

      case 'disbursed_total': {
        const { data } = await supabase
          .from('fund_requests')
          .select('amount_approved, amount_requested')
          .eq('status', 'transferred');
        const rows = (data ?? []) as { amount_approved: number | null; amount_requested: number }[];
        const total = rows.reduce((s, r) => s + Number(r.amount_approved ?? r.amount_requested), 0);
        return {
          text: total
            ? `${withFx(total)} has been transferred to members since the foundation started, across ${rows.length} transfer${rows.length === 1 ? '' : 's'}.`
            : 'Nothing has been transferred yet.',
          figures: [{ label: 'Transferred to date', value: pkr(total), pkr: total }],
          link: { href: '/admin/requests?status=transferred', label: 'See the transfers' },
          facts: { transferred_all_time_pkr: total, number_of_transfers: rows.length },
        };
      }

      case 'recurring': {
        const { data, error } = await supabase.from('recurring_grants').select('amount, is_active');
        if (error)
          return {
            text: 'Standing monthly arrangements need migration 0009. Run supabase/SETUP.sql and ask me again.',
          };
        const rows = (data ?? []) as { amount: number; is_active: boolean }[];
        const active = rows.filter((r) => r.is_active);
        const monthly = active.reduce((s, r) => s + Number(r.amount), 0);
        return {
          text: active.length
            ? `${active.length} member${active.length === 1 ? ' is' : 's are'} on a standing monthly arrangement, worth ${withFx(monthly)} a month. Their applications are filed automatically on the 1st.`
            : 'Nobody is on a standing monthly arrangement yet. Approving a Monthly Fund application enrols that member.',
          figures: [
            { label: 'Active arrangements', value: String(active.length) },
            { label: 'Committed monthly', value: pkr(monthly), pkr: monthly },
          ],
          facts: { active_arrangements: active.length, committed_each_month_pkr: monthly },
        };
      }

      case 'fx_rate': {
        if (!rates)
          return {
            text: 'The exchange-rate service did not answer just now, so I can only give you rupees. Ask again in a minute.',
          };
        return {
          text: `One rupee is worth ${rates.eur.toFixed(5)} euro and ${rates.usd.toFixed(5)} dollars today, so PKR 100,000 is about ${(100000 * rates.eur).toFixed(0)} euro. Rates come from open.er-api.com and are refreshed hourly.`,
          figures: [
            { label: 'PKR 1 in EUR', value: rates.eur.toFixed(5) },
            { label: 'PKR 1 in USD', value: rates.usd.toFixed(5) },
          ],
          facts: { pkr_to_eur: rates.eur, pkr_to_usd: rates.usd },
        };
      }

      case 'request_lookup': {
        const { data } = await supabase
          .from('fund_requests')
          .select(
            'reference, status, amount_requested, amount_approved, purpose, created_at, transferred_at, transfer_ref, admin_note, profiles!fund_requests_user_id_fkey(full_name, email), fund_types(name)'
          )
          .eq('reference', reference!)
          .maybeSingle();

        const r = data as unknown as {
          reference: string;
          status: string;
          amount_requested: number;
          amount_approved: number | null;
          purpose: string | null;
          created_at: string;
          transferred_at: string | null;
          transfer_ref: string | null;
          admin_note: string | null;
          profiles: { full_name: string; email: string } | null;
          fund_types: { name: string } | null;
        } | null;

        if (!r)
          return {
            text: `There is no application with reference ${reference}. Check the number on the application itself.`,
            link: { href: '/admin/requests', label: 'Open applications' },
          };

        const amount = Number(r.amount_approved ?? r.amount_requested);
        return {
          text: `${r.reference} is ${r.status} — ${r.profiles?.full_name ?? 'a member'} applied for ${withFx(Number(r.amount_requested))} from ${r.fund_types?.name ?? 'a fund'} on ${r.created_at.slice(0, 10)}${r.amount_approved != null ? `, approved at ${pkr(Number(r.amount_approved))}` : ''}${r.transferred_at ? `, transferred on ${r.transferred_at.slice(0, 10)}` : ''}.`,
          figures: [
            { label: 'Requested', value: pkr(Number(r.amount_requested)) },
            { label: 'Approved', value: r.amount_approved == null ? '—' : pkr(Number(r.amount_approved)) },
            { label: 'Status', value: r.status },
          ],
          link: { href: `/admin/requests?q=${r.reference}`, label: 'Open the application' },
          facts: {
            reference: r.reference,
            member: r.profiles?.full_name ?? null,
            fund: r.fund_types?.name ?? null,
            status: r.status,
            amount_requested_pkr: Number(r.amount_requested),
            amount_approved_pkr: r.amount_approved === null ? null : Number(r.amount_approved),
            amount_in_play_pkr: amount,
            applied_on: r.created_at.slice(0, 10),
            transferred_on: r.transferred_at?.slice(0, 10) ?? null,
            transfer_reference: r.transfer_ref,
            purpose: r.purpose,
            admin_note: r.admin_note,
          },
        };
      }

      case 'member_lookup': {
        const p = person!;

        /*
         * Four independent questions about one person. Asked in series this
         * was four round trips before a word could be written; the donations
         * below are the only part that genuinely has to wait, because it needs
         * the donor row's id.
         */
        const [{ data: full }, { data: reqs }, { data: donorRow }, { data: fam }] =
          await Promise.all([
            supabase.from('profiles').select('*').eq('id', p.id).single(),
            supabase
              .from('fund_requests')
              .select('reference, status, amount_requested, amount_approved, created_at, fund_types(name)')
              .eq('user_id', p.id)
              .order('created_at', { ascending: false }),
            supabase.from('donors').select('id').eq('user_id', p.id).maybeSingle(),
            supabase
              .from('family_details')
              .select('total_members, monthly_income, fund_reason')
              .eq('user_id', p.id)
              .maybeSingle(),
          ]);

        const m = (full ?? {}) as Record<string, unknown>;

        const rows = (reqs ?? []) as unknown as {
          reference: string;
          status: string;
          amount_requested: number;
          amount_approved: number | null;
          created_at: string;
          fund_types: { name: string } | null;
        }[];

        const received = rows
          .filter((r) => r.status === 'transferred')
          .reduce((s, r) => s + Number(r.amount_approved ?? r.amount_requested), 0);
        const open = rows.filter((r) => r.status === 'requested' || r.status === 'review').length;

        // Donations made, where this member is also on the donor list.
        let given = 0;
        if (donorRow) {
          const { data: dons } = await supabase
            .from('donations')
            .select('amount')
            .eq('donor_id', (donorRow as { id: string }).id);
          given = ((dons ?? []) as { amount: number }[]).reduce((s, d) => s + Number(d.amount), 0);
        }

        const family = fam as { total_members: number | null; monthly_income: number | null; fund_reason: string | null } | null;

        // One sentence about them, then only the things worth flagging.
        const opening = [
          `${p.full_name} joined on ${String(m.created_at ?? '').slice(0, 10)}`,
          rows.length
            ? `has made ${rows.length} application${rows.length === 1 ? '' : 's'}${open ? ` (${open} still open)` : ''}`
            : 'has never applied',
          received ? `and has received ${withFx(received)}` : 'and has received nothing yet',
        ].join(', ');

        const notes: string[] = [];
        if (given) notes.push(`They have also donated ${pkr(given)}.`);
        if (m.is_blocked) notes.push('This account is blocked.');
        if (!m.bank_account_number)
          notes.push('No bank details are on file, so nothing can be transferred to them.');
        if (!m.nic_path) notes.push('No CNIC has been uploaded.');

        return {
          text: `${[`${opening}.`, ...notes].join(' ')}${alsoMatched.length ? ` (I also matched ${alsoMatched.join(' and ')} — ask again with a fuller name if you meant one of them.)` : ''}`,
          figures: [
            { label: 'Applications', value: String(rows.length) },
            { label: 'Received', value: pkr(received), pkr: received },
            ...(given ? [{ label: 'Donated', value: pkr(given), pkr: given }] : []),
            { label: 'Bank details', value: m.bank_account_number ? 'On file' : 'Missing' },
            { label: 'CNIC', value: m.nic_path ? 'On file' : 'Missing' },
          ],
          link: { href: `/admin/members/${p.id}`, label: `Open ${p.full_name}` },
          facts: {
            member: {
              name: p.full_name,
              email: p.email,
              city: m.city,
              age: m.age,
              gender: m.gender,
              role: m.role,
              blocked: m.is_blocked,
              registered_on: String(m.created_at ?? '').slice(0, 10),
              bank_details_on_file: Boolean(m.bank_account_number),
              bank_name: m.bank_name ?? null,
              cnic_on_file: Boolean(m.nic_path),
            },
            applications: rows.map((r) => ({
              reference: r.reference,
              fund: r.fund_types?.name ?? null,
              status: r.status,
              amount_requested_pkr: Number(r.amount_requested),
              amount_approved_pkr: r.amount_approved === null ? null : Number(r.amount_approved),
              applied_on: r.created_at.slice(0, 10),
            })),
            total_received_pkr: received,
            total_donated_pkr: given,
            family: family
              ? {
                  household_size: family.total_members,
                  monthly_income_pkr: family.monthly_income,
                  why_the_fund_is_needed: family.fund_reason,
                }
              : null,
            other_people_matching_that_name: alsoMatched,
          },
        };
      }

      case 'help':
      default: {
        /*
         * Nothing in the data matched. Before giving up, try it as a question
         * about how the foundation works — "what happens when I reject an
         * application?" has an answer, just not one any query can produce.
         *
         * Answered from a written description of this system, never from the
         * model's own idea of how a welfare portal might behave, and it is
         * told to say so rather than invent a feature. It is also forbidden
         * from stating a figure: explanations and figures come from different
         * places here and must not be confused for one another.
         */
        if (geminiReady()) {
          const explained = await explain(question, SYSTEM_GUIDE);
          if (explained) return { text: explained, suggestions: SUGGESTIONS.slice(0, 3) };
        }

        const words = keywords(question);
        const picked = words.slice(0, 3).join(', ');
        return {
          text: words.length
            ? `I picked out “${picked}” from that, but it does not match anything I hold — no member, fund or application by that name. Here is what I can answer: ${CAPABILITIES.join('; ')}.`
            : "I can answer questions about this foundation's own figures — money in, money out, members and applications. I read them straight from the database, so I will never make a number up; if I do not understand, I will say so rather than guess. Try one of these:",
          suggestions: SUGGESTIONS,
        };
      }
    }
  }
}
