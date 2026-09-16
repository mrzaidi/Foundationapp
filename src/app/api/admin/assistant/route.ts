import { NextResponse } from 'next/server';
import { SUGGESTIONS, classify, monthFrom, monthLabel, type Intent } from '@/lib/assistant';
import { getRates } from '@/lib/rates';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PK = '+05:00';

interface Answer {
  text: string;
  /** Headline numbers, rendered as chips under the sentence. */
  figures?: { label: string; value: string; pkr?: number }[];
  /** Where to go for the detail behind the answer. */
  link?: { href: string; label: string };
  suggestions?: string[];
}

/**
 * POST /api/admin/assistant — answer a question about the foundation's own data.
 *
 * Every figure here is read live from Postgres. Nothing is summarised by a model
 * and nothing is cached, because the one thing worse than a slow answer about a
 * balance is a confident stale one.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin')
    return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });

  let body: { question?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const question = (body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Ask me something.' }, { status: 422 });

  const intent = classify(question);
  const { month, explicit } = monthFrom(question);
  const label = monthLabel(month);
  const when = explicit ? `in ${label}` : `this month (${label})`;

  const rates = await getRates();
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

  const answer = await build(intent);
  return NextResponse.json({ intent, month, answer });

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
        };
      }

      case 'remaining': {
        const b = await budget();
        const left = Number(b.remaining ?? 0);
        const committed = Number(b.committed ?? 0);
        const tail =
          committed > 0
            ? ` ${pkr(committed)} is approved and still waiting to be paid.`
            : '';
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
        };
      }

      case 'members_total': {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });
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
        };
      }

      case 'donor_count': {
        const b = await budget();
        const { data: all } = await supabase.rpc('donor_month', { p_month: monthStart });
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
          };

        return {
          text: `The largest donations ${when}:`,
          figures: list.map((d) => ({
            label: d.name,
            value: pkr(Number(d.given)),
            pkr: Number(d.given),
          })),
          link: { href: '/admin/budget', label: 'Open the donors' },
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
        };
      }

      case 'disbursed_total': {
        const { data } = await supabase
          .from('fund_requests')
          .select('amount_approved, amount_requested')
          .eq('status', 'transferred');
        const rows = (data ?? []) as { amount_approved: number | null; amount_requested: number }[];
        const total = rows.reduce(
          (s, r) => s + Number(r.amount_approved ?? r.amount_requested),
          0
        );
        return {
          text: total
            ? `${withFx(total)} has been transferred to members since the foundation started, across ${rows.length} transfer${rows.length === 1 ? '' : 's'}.`
            : 'Nothing has been transferred yet.',
          figures: [{ label: 'Transferred to date', value: pkr(total), pkr: total }],
          link: { href: '/admin/requests?status=transferred', label: 'See the transfers' },
        };
      }

      case 'recurring': {
        const { data, error } = await supabase
          .from('recurring_grants')
          .select('amount, is_active');
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
        };
      }

      case 'help':
      default:
        return {
          text: "I can answer questions about this foundation's own figures — money in, money out, members and applications. I read them straight from the database, so I will never make a number up; if I do not understand, I will say so rather than guess. Try one of these:",
          suggestions: SUGGESTIONS,
        };
    }
  }
}
