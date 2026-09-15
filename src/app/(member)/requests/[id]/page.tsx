import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import DocumentGallery from '@/components/DocumentGallery';
import Icon from '@/components/Icon';
import { StatusBar } from '@/components/PhoneShell';
import StatusBadge from '@/components/StatusBadge';
import Tracker from '@/components/Tracker';
import { createClient } from '@/lib/supabase/server';
import { PIPELINE, dateTimeLabel, money, stageIndex } from '@/lib/format';
import { fundText } from '@/lib/funds';
import { getI18n } from '@/lib/i18n/server';
import type { FundRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, locale } = await getI18n();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('fund_requests')
    .select('*, fund_types(*), request_attachments(*), request_events(*)')
    .eq('id', id)
    .single();

  if (!data) notFound();
  const r = data as FundRequest;
  const text = fundText(r.fund_types, locale);

  const events = [...(r.request_events ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const current = stageIndex(r.status);

  // What the member sent in, and what the foundation sent back. The receipt is
  // the answer to "has the money actually gone?", so it does not belong
  // buried in a list of their own bills.
  const attachments = r.request_attachments ?? [];
  const receipts = attachments.filter((a) => a.kind === 'receipt');
  const supplied = attachments.filter((a) => a.kind !== 'receipt');
  const docCount = supplied.length;

  return (
    <div className="screen">
      <div className="hero tight">
        <StatusBar />
        <div className="appbar">
          <Link href="/requests" className="icon-btn" aria-label={d.common.back}>
            <Icon name="chevronLeft" className="flip" />
          </Link>
          <div style={{ flex: 1 }}>
            <h1>{text.name}</h1>
            <div className="sub ref">{r.reference}</div>
          </div>
        </div>

        <div
          className="mt-20"
          style={{
            background: 'rgba(255,255,255,.16)',
            border: '1px solid rgba(255,255,255,.22)',
            borderRadius: 20,
            padding: '15px 17px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, opacity: 0.85, letterSpacing: 0.3 }}>
              {r.amount_approved ? d.detail.approvedAmount : d.detail.requestedAmount}
            </div>
            <div
              className="num"
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: '-.8px',
                marginTop: 4,
                lineHeight: 1,
              }}
            >
              {money(Number(r.amount_approved ?? r.amount_requested))}
            </div>
            {r.amount_approved != null &&
              Number(r.amount_approved) !== Number(r.amount_requested) && (
                <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 6 }}>
                  {d.detail.youRequested(money(Number(r.amount_requested)))}
                </div>
              )}
          </div>
          <StatusBadge status={r.status} />
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
      {/* ---------- tracker ---------- */}
      <div className="pad overlap">
        <div className="card">
          <Tracker status={r.status} events={events} />
          <p className="muted mb-0 mt-16" style={{ fontSize: 12.5, textAlign: 'center' }}>
            {d.status.blurb[r.status]}
          </p>
        </div>
      </div>

      {/* ---------- details ---------- */}
      <div className="pad">
        <div className="section-head">
          <h2>{d.detail.details}</h2>
        </div>
        <div className="card">
          <div className="kv">
            <span className="k">{d.detail.fund}</span>
            <span className="v">{text.name}</span>
          </div>
          <div className="kv">
            <span className="k">{d.detail.reference}</span>
            <span className="v ref">{r.reference}</span>
          </div>
          <div className="kv">
            <span className="k">{d.detail.submitted}</span>
            <span className="v num">{dateTimeLabel(r.created_at)}</span>
          </div>
          <div className="kv">
            <span className="k">{d.detail.requested}</span>
            <span className="v num">{money(Number(r.amount_requested))}</span>
          </div>
          {r.amount_approved != null && (
            <div className="kv">
              <span className="k">{d.detail.approved}</span>
              <span className="v num" style={{ color: 'var(--brand-2)' }}>
                {money(Number(r.amount_approved))}
              </span>
            </div>
          )}
          {r.transfer_ref && (
            <div className="kv">
              <span className="k">{d.detail.transferRef}</span>
              <span className="v ref">{r.transfer_ref}</span>
            </div>
          )}
          {r.transferred_at && (
            <div className="kv">
              <span className="k">{d.detail.transferred}</span>
              <span className="v num">{dateTimeLabel(r.transferred_at)}</span>
            </div>
          )}
          {r.purpose && (
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 4 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 5 }}>
                {d.detail.yourReason}
              </div>
              <p className="mb-0" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>
                {r.purpose}
              </p>
            </div>
          )}
        </div>

        {r.admin_note && (
          <div className="note mt-12">
            <strong style={{ color: 'var(--text)' }}>{d.detail.noteFromFoundation}</strong>{' '}
            {r.admin_note}
          </div>
        )}
      </div>

        </div>

        <aside className="detail-aside">
      {/* ---------- attachments ---------- */}
      <div className="pad">
        <div className="section-head">
          <h2>{d.detail.documents}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{d.detail.files(docCount)}</span>
        </div>

        <DocumentGallery attachments={supplied} />
      </div>

      {/* ---------- transfer receipt ---------- */}
      {receipts.length > 0 && (
        <div className="pad">
          <div className="section-head">
            <h2>{d.detail.receipt}</h2>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {d.detail.files(receipts.length)}
            </span>
          </div>
          <div className="receipt-note">
            <span className="rn-ico">
              <Icon name="checkCircle" />
            </span>
            <p>{d.detail.receiptBody}</p>
          </div>
          <DocumentGallery attachments={receipts} />
        </div>
      )}

      {/* ---------- timeline ---------- */}
      <div className="pad">
        <div className="section-head">
          <h2>{d.detail.history}</h2>
        </div>
        <div className="card">
          <div className="timeline">
            {events.map((e) => (
              <div className="ev on" key={e.id}>
                <div className="mark">
                  <Icon name="check" strokeWidth={2.6} />
                </div>
                <div className="t">{d.status[e.status]}</div>
                <div className="d">
                  {e.note ?? d.status.blurb[e.status]}
                  <br />
                  <span className="num" style={{ color: 'var(--text-faint)' }}>
                    {dateTimeLabel(e.created_at)}
                  </span>
                </div>
              </div>
            ))}

            {/* stages still ahead */}
            {r.status !== 'rejected' &&
              PIPELINE.slice(current + 1).map((s) => (
                <div className="ev off" key={s}>
                  <div className="mark">
                    <Icon name="clock" />
                  </div>
                  <div className="t">{d.status[s]}</div>
                  <div className="d">{d.status.blurb[s]}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
        </aside>
      </div>
    </div>
  );
}
