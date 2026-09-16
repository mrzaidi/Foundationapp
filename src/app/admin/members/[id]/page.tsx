import { requirePage } from '@/lib/admin-guard';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import DocumentGallery from '@/components/DocumentGallery';
import FamilyDetails from '@/components/FamilyDetails';
import Icon from '@/components/Icon';
import RecurringControl from '@/components/RecurringControl';
import StatusBadge from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase/server';
import { formatAccount, hasBankDetails } from '@/lib/banks';
import { dateLabel, dateTimeLabel, initials, money } from '@/lib/format';
import type { FundRequest, Profile, RecurringGrant } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminMemberDetail({ params }: { params: Promise<{ id: string }> }) {
  const level = await requirePage('view_members');

  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (!member) notFound();
  const m = member as Profile;

  const { data: reqData } = await supabase
    .from('fund_requests')
    .select('*, fund_types(*)')
    .eq('user_id', id)
    .order('created_at', { ascending: false });

  const { data: grantRows } = await supabase
    .from('recurring_grants')
    .select('*, fund_types(id, name)')
    .eq('user_id', id)
    .order('created_at', { ascending: false });

  const grants = (grantRows ?? []) as unknown as RecurringGrant[];
  const requests = (reqData ?? []) as FundRequest[];
  const received = requests
    .filter((r) => r.status === 'transferred')
    .reduce((s, r) => s + Number(r.amount_approved ?? r.amount_requested), 0);
  const open = requests.filter((r) => r.status === 'requested' || r.status === 'review').length;

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/admin/members" className="admin-btn ghost" aria-label="Back">
            <Icon name="chevronLeft" />
          </Link>
          <div>
            <h1>{m.full_name}</h1>
            <div className="crumb">
              Member since {dateLabel(m.created_at)} · {m.city}, {m.country}
            </div>
          </div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kico g-brand">
            <Icon name="inbox" />
          </div>
          <div className="kn">{requests.length}</div>
          <div className="kl">Applications submitted</div>
        </div>
        <div className="kpi">
          <div className="kico g-amber">
            <Icon name="clock" />
          </div>
          <div className="kn">{open}</div>
          <div className="kl">Awaiting a decision</div>
        </div>
        <div className="kpi">
          <div className="kico g-plum">
            <Icon name="wallet" />
          </div>
          <div className="kn">{money(received, false)}</div>
          <div className="kl">PKR received</div>
        </div>
        <div className="kpi">
          <div className={`kico ${m.nic_path ? 'g-brand' : 'g-rose'}`}>
            <Icon name="idcard" />
          </div>
          <div className="kn" style={{ fontSize: 20 }}>
            {m.nic_path ? 'On file' : 'Missing'}
          </div>
          <div className="kl">CNIC</div>
        </div>
      </div>

      <div className="two-col mt-24">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Applications</h2>
              <div className="ph-sub">Every request this member has submitted</div>
            </div>
          </div>
          {requests.length === 0 ? (
            <div className="panel-body">
              <p className="muted mb-0">This member has not applied for anything yet.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Fund</th>
                    <th>Requested</th>
                    <th>Approved</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="ref">{r.reference}</td>
                      <td>
                        <span className="fundtag">
                          <span className={`fdot ${r.fund_types?.gradient ?? 'g-brand'}`}>
                            <Icon name={r.fund_types?.icon ?? 'heart'} />
                          </span>
                          {r.fund_types?.name}
                        </span>
                      </td>
                      <td className="num">{money(Number(r.amount_requested), false)}</td>
                      <td className="num">
                        {r.amount_approved != null ? money(Number(r.amount_approved), false) : '—'}
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {dateLabel(r.created_at)}
                      </td>
                      <td>
                        <Link className="rowlink" href={`/admin/requests/${r.id}`}>
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Member details</h2>
                <div className="ph-sub">Details supplied at sign-up</div>
              </div>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div
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
                  {initials(m.full_name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{m.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{m.email}</div>
                </div>
              </div>

              <div className="kv">
                <span className="k">Mobile</span>
                <span className="v">{m.mobile}</span>
              </div>
              <div className="kv">
                <span className="k">Gender</span>
                <span className="v" style={{ textTransform: 'capitalize' }}>
                  {m.gender}
                </span>
              </div>
              <div className="kv">
                <span className="k">Age</span>
                <span className="v">{m.age}</span>
              </div>
              <div className="kv">
                <span className="k">City</span>
                <span className="v">{m.city}</span>
              </div>
              <div className="kv">
                <span className="k">Country</span>
                <span className="v">{m.country}</span>
              </div>
              <div className="kv">
                <span className="k">Role</span>
                <span className="v" style={{ textTransform: 'capitalize' }}>
                  {m.role}
                </span>
              </div>
              <div className="kv">
                <span className="k">Registered</span>
                <span className="v">{dateTimeLabel(m.created_at)}</span>
              </div>
            </div>
          </div>

          {grants.map((g) => (
            <div className="panel" key={g.id}>
              <div className="panel-head">
                <div>
                  <h2>Monthly arrangement</h2>
                  <div className="ph-sub">
                    {g.fund_types?.name ?? g.fund_type_id} — filed on the 1st of each month
                  </div>
                </div>
                <Icon name="refresh" />
              </div>
              <div className="panel-body">
                <RecurringControl grant={g} />
              </div>
            </div>
          ))}

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Payout account</h2>
                <div className="ph-sub">Where transfers to this member are sent</div>
              </div>
              <Icon name="bank" />
            </div>
            <div className="panel-body">
              {hasBankDetails(m) ? (
                <>
                  <div className="kv">
                    <span className="k">Bank</span>
                    <span className="v">{m.bank_name}</span>
                  </div>
                  <div className="kv">
                    <span className="k">IBAN / account</span>
                    <span
                      className="v"
                      style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}
                    >
                      {formatAccount(m.bank_account_number)}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="k">Account holder</span>
                    <span className="v">{m.bank_account_title}</span>
                  </div>
                </>
              ) : (
                <div className="note">
                  No bank details on file. The member is asked for them the first time they apply.
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Identity</h2>
                <div className="ph-sub">CNIC supplied at registration</div>
              </div>
            </div>
            <div className="panel-body">
              {m.nic_path ? (
                <DocumentGallery
                  attachments={[{
                    id: 'nic',
                    request_id: '',
                    user_id: m.id,
                    path: m.nic_path,
                    file_name: 'CNIC on file',
                    mime_type: 'image/jpeg',
                    size_bytes: null,
                    kind: 'cnic',
                    created_at: m.created_at,
                  }]}
                />
              ) : (
                <div className="note">
                  No CNIC image on file. Ask the member to bring their card to the office.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <FamilyDetails userId={m.id} memberName={m.full_name} />
    </>
  );
}
