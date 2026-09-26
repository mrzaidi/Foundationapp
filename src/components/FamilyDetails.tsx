'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { useToast } from './Toast';
import { money } from '@/lib/format';

const INCOME_SOURCES = [
  { key: 'labour', label: 'Labour' },
  { key: 'business', label: 'Business' },
  { key: 'job', label: 'Job' },
  { key: 'pension', label: 'Pension' },
  { key: 'other', label: 'Other' },
];

interface Person {
  name: string | null;
  age: number | null;
  relation: string | null;
}

interface Family {
  head_name: string | null;
  father_name: string | null;
  father_mobile: string | null;
  father_status: 'alive' | 'deceased' | null;
  address: string | null;
  total_members: number | null;
  male_count: number | null;
  female_count: number | null;
  members: Person[];
  income_sources: string[];
  income_source_other: string | null;
  monthly_income: number | null;
  monthly_expense: number | null;
  house_type: 'own' | 'rent' | null;
  has_bank_account: boolean | null;
  bill_ke: number | null;
  rent: number | null;
  education_expense: number | null;
  medical_expense: number | null;
  fund_reason: string | null;
  updated_at?: string;
}

type Draft = {
  [K in keyof Omit<Family, 'members' | 'income_sources' | 'updated_at'>]: string;
} & {
  members: { name: string; age: string; relation: string }[];
  income_sources: string[];
};

const EMPTY: Draft = {
  head_name: '',
  father_name: '',
  father_mobile: '',
  father_status: '',
  address: '',
  total_members: '',
  male_count: '',
  female_count: '',
  members: [],
  income_sources: [],
  income_source_other: '',
  monthly_income: '',
  monthly_expense: '',
  house_type: '',
  has_bank_account: '',
  bill_ke: '',
  rent: '',
  education_expense: '',
  medical_expense: '',
  fund_reason: '',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function draftOf(f: Family | null): Draft {
  if (!f) return { ...EMPTY, members: [] };
  return {
    head_name: str(f.head_name),
    father_name: str(f.father_name),
    father_mobile: str(f.father_mobile),
    father_status: str(f.father_status),
    address: str(f.address),
    total_members: str(f.total_members),
    male_count: str(f.male_count),
    female_count: str(f.female_count),
    members: (f.members ?? []).map((m) => ({
      name: str(m.name),
      age: str(m.age),
      relation: str(m.relation),
    })),
    income_sources: f.income_sources ?? [],
    income_source_other: str(f.income_source_other),
    monthly_income: str(f.monthly_income),
    monthly_expense: str(f.monthly_expense),
    house_type: str(f.house_type),
    has_bank_account: f.has_bank_account === null || f.has_bank_account === undefined ? '' : f.has_bank_account ? 'yes' : 'no',
    bill_ke: str(f.bill_ke),
    rent: str(f.rent),
    education_expense: str(f.education_expense),
    medical_expense: str(f.medical_expense),
    fund_reason: str(f.fund_reason),
  };
}

const MAX_MEMBERS = 60;

/**
 * The household behind an application — filled in by staff, not the member.
 *
 * The member roll follows the total: type 6 and six rows appear. Rows already
 * filled in are never dropped by lowering the number, because a mistyped total
 * should not silently delete the family you just recorded — trailing blanks are
 * what get trimmed, and only on save.
 */
export default function FamilyDetails({
  familyId,
  headName,
}: {
  /** The household's own id. A family stands on its own; see migration 0023. */
  familyId: string;
  /** The head of the family; this component names the household after them. */
  headName: string;
}) {
  const toast = useToast();

  const [family, setFamily] = useState<Family | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // False until migration 0011 runs; the panel hides rather than showing a
  // Postgres error on a page that is otherwise fine.
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/family?id=${familyId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setFamily(json.family ?? null);
      setDraft(draftOf(json.family ?? null));
      setAvailable(true);
      setError('');
    } catch (e) {
      const msg = (e as Error).message || 'Could not load family details.';
      if (/families|schema cache|does not exist/i.test(msg)) setAvailable(false);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  /** Grow the roll to match the total; never shrink away filled rows. */
  function setTotal(value: string) {
    const wanted = Math.min(Math.max(0, Math.round(Number(value) || 0)), MAX_MEMBERS);
    setDraft((d) => {
      const rows = [...d.members];
      while (rows.length < wanted) rows.push({ name: '', age: '', relation: '' });
      while (rows.length > wanted) {
        const last = rows[rows.length - 1];
        if (last.name || last.age || last.relation) break; // filled — leave it
        rows.pop();
      }
      return { ...d, total_members: value, members: rows };
    });
  }

  function setPerson(i: number, key: 'name' | 'age' | 'relation', v: string) {
    setDraft((d) => {
      const rows = [...d.members];
      rows[i] = { ...rows[i], [key]: v };
      return { ...d, members: rows };
    });
  }

  function toggleSource(key: string) {
    setDraft((d) => ({
      ...d,
      income_sources: d.income_sources.includes(key)
        ? d.income_sources.filter((s) => s !== key)
        : [...d.income_sources, key],
    }));
  }

  async function save() {
    const male = Number(draft.male_count || 0);
    const female = Number(draft.female_count || 0);
    const total = Number(draft.total_members || 0);
    if (draft.total_members && male + female > total) {
      setError('Male and female counts add up to more than the total.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/family', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: familyId,
          ...draft,
          head_name: draft.head_name.trim() || headName,
          has_bank_account:
            draft.has_bank_account === '' ? null : draft.has_bank_account === 'yes',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save the family details.');
      toast('Family details saved');
      setFamily(json.family);
      setDraft(draftOf(json.family));
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;

  const recorded = Boolean(family);
  const sourceLabels = (family?.income_sources ?? [])
    .map((s) => INCOME_SOURCES.find((x) => x.key === s)?.label ?? s)
    .join(', ');

  return (
    <div className="panel mt-24">
      <div className="panel-head">
        <div>
          <h2>Family details</h2>
          <div className="ph-sub">
            {headName ? `The household of ${headName} — recorded` : 'Recorded'} by the
            foundation, and never shown outside the office
          </div>
        </div>
        {!loading && !editing && (
          <button className="admin-btn ghost" type="button" onClick={() => setEditing(true)}>
            <Icon name={recorded ? 'settings' : 'plus'} />
            {recorded ? 'Edit' : 'Add family details'}
          </button>
        )}
      </div>

      {loading && (
        <div className="panel-body">
          <span className="sk" style={{ display: 'block', height: 120, borderRadius: 12 }} />
        </div>
      )}

      {!loading && !editing && !recorded && (
        <div className="panel-body">
          <div className="empty">
            <div className="e-ico">
              <Icon name="users" />
            </div>
            <h3>No family details yet</h3>
            <p>
              Record the household the committee is deciding on — who depends on this member, what
              comes in and what goes out.
            </p>
          </div>
        </div>
      )}

      {/* ---------------- read ---------------- */}
      {!loading && !editing && recorded && family && (
        <div className="panel-body">
          <div className="fam-grid">
            <div className="kv">
              <span className="k">Head of the family</span>
              <span className="v">{family.head_name || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Father</span>
              <span className="v">{family.father_name || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Father&rsquo;s mobile</span>
              <span className="v" dir="ltr">
                {family.father_mobile || '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Father&rsquo;s status</span>
              <span
                className="v"
                style={{ color: family.father_status === 'deceased' ? 'var(--danger)' : undefined }}
              >
                {family.father_status === 'deceased'
                  ? 'Deceased'
                  : family.father_status === 'alive'
                    ? 'Alive'
                    : '—'}
              </span>
            </div>
            <div className="kv fam-wide">
              <span className="k">Address</span>
              <span className="v">{family.address || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Family members</span>
              <span className="v num">{family.total_members ?? '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Male / female</span>
              <span className="v num">
                {family.male_count ?? '—'} / {family.female_count ?? '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Source of income</span>
              <span className="v">
                {sourceLabels || '—'}
                {family.income_source_other ? ` (${family.income_source_other})` : ''}
              </span>
            </div>
            <div className="kv">
              <span className="k">House</span>
              <span className="v" style={{ textTransform: 'capitalize' }}>
                {family.house_type || '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Monthly income</span>
              <span className="v num">
                {family.monthly_income != null ? money(Number(family.monthly_income)) : '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Monthly expense</span>
              <span className="v num">
                {family.monthly_expense != null ? money(Number(family.monthly_expense)) : '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Electricity (KE)</span>
              <span className="v num">
                {family.bill_ke != null ? money(Number(family.bill_ke)) : '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Rent</span>
              <span className="v num">{family.rent != null ? money(Number(family.rent)) : '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Children&rsquo;s education</span>
              <span className="v num">
                {family.education_expense != null
                  ? money(Number(family.education_expense))
                  : '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Medicine / hospital</span>
              <span className="v num">
                {family.medical_expense != null ? money(Number(family.medical_expense)) : '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Own bank account</span>
              <span className="v">
                {family.has_bank_account === null
                  ? '—'
                  : family.has_bank_account
                    ? 'Yes'
                    : 'No'}
              </span>
            </div>
          </div>

          {(family.members ?? []).length > 0 && (
            <>
              <div className="fam-subhead">Household</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>#</th>
                      <th>Name</th>
                      <th style={{ width: 90 }}>Age</th>
                      <th>Relation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {family.members.map((m, i) => (
                      <tr key={i}>
                        <td className="num">{i + 1}</td>
                        <td>{m.name || '—'}</td>
                        <td className="num">{m.age ?? '—'}</td>
                        <td>{m.relation || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {family.fund_reason && (
            <>
              <div className="fam-subhead">Why the fund is needed</div>
              <p className="fam-reason">{family.fund_reason}</p>
            </>
          )}
        </div>
      )}

      {/* ---------------- edit ---------------- */}
      {!loading && editing && (
        <div className="panel-body">
          <div className="fam-subhead first">The family</div>
          <div className="row-3">
            <div className="field">
              <label htmlFor="f_head">Head of the family</label>
              <input
                id="f_head"
                className="input"
                value={draft.head_name}
                onChange={(e) => set('head_name', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f_father">Father&rsquo;s name</label>
              <input
                id="f_father"
                className="input"
                value={draft.father_name}
                onChange={(e) => set('father_name', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f_fmobile">Father&rsquo;s mobile</label>
              <input
                id="f_fmobile"
                className="input"
                dir="ltr"
                value={draft.father_mobile}
                onChange={(e) => set('father_mobile', e.target.value)}
                placeholder="+92 300 1234567"
              />
            </div>
          </div>

          <div className="row-3">
            <div className="field">
              <label htmlFor="f_status">Father — alive or deceased</label>
              <select
                id="f_status"
                className="input"
                value={draft.father_status}
                onChange={(e) => set('father_status', e.target.value)}
              >
                <option value="">Not recorded</option>
                <option value="alive">Alive</option>
                <option value="deceased">Deceased</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f_house">House type</label>
              <select
                id="f_house"
                className="input"
                value={draft.house_type}
                onChange={(e) => set('house_type', e.target.value)}
              >
                <option value="">Not recorded</option>
                <option value="own">Own</option>
                <option value="rent">Rent</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f_bank">Has a bank account</label>
              <select
                id="f_bank"
                className="input"
                value={draft.has_bank_account}
                onChange={(e) => set('has_bank_account', e.target.value)}
              >
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="f_address">Address</label>
            <textarea
              id="f_address"
              className="input"
              rows={2}
              value={draft.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>

          <div className="fam-subhead">Household size</div>
          <div className="row-3">
            <div className="field">
              <label htmlFor="f_total">Total family members</label>
              <input
                id="f_total"
                className="input"
                type="number"
                min={0}
                max={MAX_MEMBERS}
                value={draft.total_members}
                onChange={(e) => setTotal(e.target.value)}
              />
              <p className="field-hint">A row appears below for each one.</p>
            </div>
            <div className="field">
              <label htmlFor="f_male">Male count</label>
              <input
                id="f_male"
                className="input"
                type="number"
                min={0}
                value={draft.male_count}
                onChange={(e) => set('male_count', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f_female">Female count</label>
              <input
                id="f_female"
                className="input"
                type="number"
                min={0}
                value={draft.female_count}
                onChange={(e) => set('female_count', e.target.value)}
              />
            </div>
          </div>

          {draft.members.length > 0 && (
            <div className="fam-people">
              {draft.members.map((m, i) => (
                <div className="fam-person" key={i}>
                  <span className="fp-n num">{i + 1}</span>
                  <div className="field mb-0">
                    <label htmlFor={`fm_n_${i}`}>Member {i + 1} name</label>
                    <input
                      id={`fm_n_${i}`}
                      className="input"
                      value={m.name}
                      onChange={(e) => setPerson(i, 'name', e.target.value)}
                    />
                  </div>
                  <div className="field mb-0">
                    <label htmlFor={`fm_a_${i}`}>Age</label>
                    <input
                      id={`fm_a_${i}`}
                      className="input"
                      type="number"
                      min={0}
                      max={120}
                      value={m.age}
                      onChange={(e) => setPerson(i, 'age', e.target.value)}
                    />
                  </div>
                  <div className="field mb-0">
                    <label htmlFor={`fm_r_${i}`}>Relation</label>
                    <input
                      id={`fm_r_${i}`}
                      className="input"
                      value={m.relation}
                      onChange={(e) => setPerson(i, 'relation', e.target.value)}
                      placeholder="e.g. son, mother"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="fam-subhead">Income</div>
          <div className="field">
            <label>Source of income</label>
            <div className="fam-checks">
              {INCOME_SOURCES.map((s) => (
                <label className="check" key={s.key}>
                  <input
                    type="checkbox"
                    checked={draft.income_sources.includes(s.key)}
                    onChange={() => toggleSource(s.key)}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          {draft.income_sources.includes('other') && (
            <div className="field">
              <label htmlFor="f_other">Other source — what is it?</label>
              <input
                id="f_other"
                className="input"
                value={draft.income_source_other}
                onChange={(e) => set('income_source_other', e.target.value)}
              />
            </div>
          )}

          <div className="row-2">
            <div className="field">
              <label htmlFor="f_income">Monthly family income (PKR)</label>
              <input
                id="f_income"
                className="input"
                type="number"
                min={0}
                value={draft.monthly_income}
                onChange={(e) => set('monthly_income', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f_expense">Monthly expense (PKR)</label>
              <input
                id="f_expense"
                className="input"
                type="number"
                min={0}
                value={draft.monthly_expense}
                onChange={(e) => set('monthly_expense', e.target.value)}
              />
            </div>
          </div>

          <div className="fam-subhead">Estimated monthly outgoings</div>
          <div className="row-2">
            <div className="field">
              <label htmlFor="f_ke">Electricity bill — KE (PKR)</label>
              <input
                id="f_ke"
                className="input"
                type="number"
                min={0}
                value={draft.bill_ke}
                onChange={(e) => set('bill_ke', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f_rent">Rent (PKR)</label>
              <input
                id="f_rent"
                className="input"
                type="number"
                min={0}
                value={draft.rent}
                onChange={(e) => set('rent', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f_edu">Children&rsquo;s education (PKR)</label>
              <input
                id="f_edu"
                className="input"
                type="number"
                min={0}
                value={draft.education_expense}
                onChange={(e) => set('education_expense', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f_med">Medicine / hospital (PKR)</label>
              <input
                id="f_med"
                className="input"
                type="number"
                min={0}
                value={draft.medical_expense}
                onChange={(e) => set('medical_expense', e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="f_reason">Why is the fund needed?</label>
            <textarea
              id="f_reason"
              className="input"
              rows={4}
              value={draft.fund_reason}
              onChange={(e) => set('fund_reason', e.target.value)}
              placeholder="In the family&rsquo;s own words where possible — this is what the committee reads."
            />
          </div>

          {error && (
            <p className="err-msg" role="alert">
              {error}
            </p>
          )}

          <div className="btn-row mt-16">
            <button
              className="admin-btn ghost"
              style={{ flex: 1, justifyContent: 'center' }}
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(draftOf(family));
                setError('');
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              className="admin-btn"
              style={{ flex: 1, justifyContent: 'center' }}
              type="button"
              disabled={busy}
              onClick={save}
            >
              {busy ? <span className="spin" /> : <Icon name="check" />}
              {busy ? 'Saving…' : 'Save family details'}
            </button>
          </div>
        </div>
      )}

      {!loading && !editing && error && (
        <div className="panel-body">
          <p className="err-msg mb-0">{error}</p>
        </div>
      )}
    </div>
  );
}
