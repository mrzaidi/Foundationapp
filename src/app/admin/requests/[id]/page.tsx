import Link from 'next/link';
import { notFound } from 'next/navigation';
import DocumentGallery from '@/components/DocumentGallery';
import Icon from '@/components/Icon';
import RecurringControl from '@/components/RecurringControl';
import RequestActions from '@/components/RequestActions';
import StatusBadge from '@/components/StatusBadge';
import Tracker from '@/components/Tracker';
import { createClient } from '@/lib/supabase/server';
import { formatAccount, hasBankDetails } from '@/lib/banks';
import { STATUS_LABEL, dateTimeLabel, initials, money } from '@/lib/format';
import type { FundRequest, RecurringGrant } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminRequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('fund_requests')
    .select(
      '*, fund_types(*), profiles!fund_requests_user_id_fkey(id, full_name, email, mobile, city, country), request_attachments(*), request_events(*)'
    )
    .eq('id', id)
    .single();

  if (!data) notFound();
  const r = data as FundRequest;

  // The member's CNIC lives on their profile, not the request.
  const { data: member } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', r.user_id)
    .single();

  // Two different things in one table: what the member sent in, and what the
  // foundation filed back. Mixing them would have staff hunting for the receipt
  // among the bills.
  const attachments = r.request_attachments ?? [];
  const receipts = attachments.filter((a) => a.kind === 'receipt');
  const supplied = attachments.filter((a) => a.kind !== 'receipt');

  // Is this member on a standing arrangement for this fund?
  const { data: grantRow } = await supabase
    .from('recurring_grants')
    .select('*, fund_types(id, name)')
    .eq('user_id', r.user_id)
    .eq('fund_type_id', r.fund_type_id)
    .maybeSingle();
  const grant = grantRow as RecurringGrant | null;

  const events = [...(r.request_events ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/admin/requests" className="admin-btn ghost" aria-label="Back">
            <Icon name="chevronLeft" />
          </Link>
          <div>
            <h1>{r.fund_types?.name}</h1>
            <div className="crumb">
              <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{r.reference}</span> ·
              submitted {dateTimeLabel(r.created_at)}
              {r.is_automatic && ' · filed automatically by the monthly arrangement'}
            </div>
          </div>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <div className="two-col">
        {/* ---------------- left: the application ---------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Progress</h2>
                <div className="ph-sub">What the member sees on their tracker</div>
              </div>
            </div>
            <div className="panel-body">
              <Tracker status={r.status} events={events} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Application</h2>
                <div className="ph-sub">Amounts and stated reason</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.6px' }}>
                  {money(Number(r.amount_requested))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>requested</div>
              </div>
            </div>
            <div className="panel-body">
              <div className="kv">
                <span className="k">Fund</span>
                <span className="v">{r.fund_types?.name}</span>
              </div>
              <div className="kv">
                <span className="k">Requested amount</span>
                <span className="v">{money(Number(r.amount_requested))}</span>
              </div>
              <div className="kv">
                <span className="k">Approved amount</span>
                <span className="v" style={{ color: r.amount_approved ? 'var(--brand-2)' : undefined }}>
                  {r.amount_approved != null ? money(Number(r.amount_approved)) : '—'}
                </span>
              </div>
              {r.transfer_ref && (
                <div className="kv">
                  <span className="k">Transfer reference</span>
                  <span className="v">{r.transfer_ref}</span>
                </div>
              )}
              {r.transferred_at && (
                <div className="kv">
                  <span className="k">Transferred at</span>
                  <span className="v">{dateTimeLabel(r.transferred_at)}</span>
                </div>
              )}

              {r.purpose && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 6 }}>
                    Member&apos;s stated reason
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      background: 'var(--card-soft)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      padding: '12px 14px',
                    }}
                  >
                    {r.purpose}
                  </p>
                </div>
              )}

              {r.admin_note && <div className="note mt-16">Your note: {r.admin_note}</div>}
            </div>
          </div>

          {/* ---------------- documents ---------------- */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Attached documents</h2>
                <div className="ph-sub">
                  Reports and bills uploaded with this application — click to open
                </div>
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                {supplied.length} file
                {supplied.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="panel-body">
              <DocumentGallery attachments={supplied} />

              {member?.nic_path && (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-faint)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.6,
                      margin: '18px 0 10px',
                    }}
                  >
                    Identity
                  </div>
                  <DocumentGallery
                    attachments={[{
                      id: 'nic',
                      request_id: r.id,
                      user_id: r.user_id,
                      path: member.nic_path,
                      file_name: 'CNIC on file',
                      mime_type: 'image/jpeg',
                      size_bytes: null,
                      kind: 'cnic',
                      created_at: member.created_at,
                    }]}
                  />
                </>
              )}
            </div>
          </div>

          {/* ---------------- transfer receipt ---------------- */}
          {(receipts.length > 0 || r.status === 'transferred') && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Transfer receipt</h2>
                  <div className="ph-sub">
                    Proof of payment, filed by the foundation — the member sees this too
                  </div>
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                  {receipts.length} file{receipts.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="panel-body">
                {receipts.length > 0 ? (
                  <DocumentGallery attachments={receipts} />
                ) : (
                  <div className="note">
                    Marked transferred without a receipt. Nothing is broken — but the member has no
                    proof of payment on their screen.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------- audit trail ---------------- */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Audit trail</h2>
                <div className="ph-sub">Every status change, recorded by Postgres triggers</div>
              </div>
            </div>
            <div className="panel-body">
              <div className="timeline">
                {events.map((e) => (
                  <div className="ev on" key={e.id}>
                    <div className="mark">
                      <Icon name="check" strokeWidth={2.6} />
                    </div>
                    <div className="t">{STATUS_LABEL[e.status]}</div>
                    <div className="d">
                      {e.note || 'No note recorded.'}
                      <br />
                      <span style={{ color: 'var(--text-faint)' }}>
                        {dateTimeLabel(e.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- right: member + actions ---------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Decision</h2>
                <div className="ph-sub">Move this application along the pipeline</div>
              </div>
            </div>
            <div className="panel-body">
              <RequestActions request={r} />
            </div>
          </div>

          {grant && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Monthly arrangement</h2>
                  <div className="ph-sub">Filed automatically on the 1st of each month</div>
                </div>
                <Icon name="refresh" />
              </div>
              <div className="panel-body">
                <RecurringControl grant={grant} />
              </div>
            </div>
          )}

          {/* Where the money actually goes — first thing staff need once a
              request is accepted, so it sits above the registration details. */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Payout account</h2>
                <div className="ph-sub">Where an approved transfer is sent</div>
              </div>
              <Icon name="bank" />
            </div>
            <div className="panel-body">
              {member && hasBankDetails(member) ? (
                <>
                  <div className="kv">
                    <span className="k">Bank</span>
                    <span className="v">{member.bank_name}</span>
                  </div>
                  <div className="kv">
                    <span className="k">IBAN / account</span>
                    <span
                      className="v"
                      style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}
                    >
                      {formatAccount(member.bank_account_number)}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="k">Account holder</span>
                    <span className="v">{member.bank_account_title}</span>
                  </div>
                </>
              ) : (
                <div className="note danger">
                  No bank details on file. This application predates the requirement — ask the
                  member to add an account from their profile before arranging a transfer.
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Member</h2>
                <div className="ph-sub">Registration details on file</div>
              </div>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div
                  className="av"
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 15,
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    background:
                      'linear-gradient(135deg, rgba(20,184,146,.18), rgba(224,165,43,.22))',
                    color: 'var(--brand-3)',
                  }}
                >
                  {initials(member?.full_name ?? '?')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{member?.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{member?.email}</div>
                </div>
              </div>

              <div className="kv">
                <span className="k">Mobile</span>
                <span className="v">{member?.mobile}</span>
              </div>
              <div className="kv">
                <span className="k">Gender</span>
                <span className="v" style={{ textTransform: 'capitalize' }}>
                  {member?.gender}
                </span>
              </div>
              <div className="kv">
                <span className="k">Age</span>
                <span className="v">{member?.age}</span>
              </div>
              <div className="kv">
                <span className="k">Location</span>
                <span className="v">
                  {member?.city}, {member?.country}
                </span>
              </div>
              <div className="kv">
                <span className="k">CNIC on file</span>
                <span className="v" style={{ color: member?.nic_path ? 'var(--brand-2)' : 'var(--danger)' }}>
                  {member?.nic_path ? 'Yes' : 'Missing'}
                </span>
              </div>

              <Link
                href={`/admin/members/${r.user_id}`}
                className="admin-btn ghost mt-16"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Icon name="user" />
                View full member record
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
