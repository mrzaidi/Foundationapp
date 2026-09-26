'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Modal from './Modal';
import { useToast } from './Toast';

interface Role {
  id: string;
  name: string;
  description: string | null;
  is_master: boolean;
  capability_count: number;
}

const MEMBER = 'member';

const BLANK = {
  full_name: '',
  gender: '',
  age: '',
  city: '',
  country: 'Pakistan',
  email: '',
  mobile: '',
  password: '',
};

/**
 * Adding someone who cannot add themselves.
 *
 * Most members register on their own phone. This is for the ones who arrive at
 * the office instead — no email of their own, or a household registered on a
 * relative's handset. The administrator sets the password here and hands it
 * over in person, because an invite link is no use to somebody with no inbox.
 *
 * The same form creates an administrator, since the only difference between
 * the two is one field.
 */
export default function NewMemberButton() {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  /** 'member', or the id of a role from the database. */
  const [kind, setKind] = useState<string>(MEMBER);
  const [roles, setRoles] = useState<Role[]>([]);

  /*
   * The roles are whatever the foundation has made up, so they are fetched
   * rather than listed here. Only somebody who may manage roles can read them
   * back; for everybody else the list stays empty and this creates members,
   * which is the only thing they could do with it anyway.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/roles');
        const json = await res.json();
        if (!cancelled && res.ok) setRoles(json.roles ?? []);
      } catch {
        if (!cancelled) setRoles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const chosen = roles.find((r) => r.id === kind) ?? null;

  const set = (k: keyof typeof BLANK, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function close() {
    if (busy) return;
    setOpen(false);
    setForm(BLANK);
    setErrors({});
    setKind(MEMBER);
  }

  /** Something they can read out over a counter without misreading it. */
  function suggestPassword() {
    const words = ['Falak', 'Chenab', 'Murree', 'Ravi', 'Hunza', 'Sutlej', 'Kaghan'];
    const word = words[Math.floor(Math.random() * words.length)];
    set('password', `${word}${Math.floor(1000 + Math.random() * 9000)}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});

    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          role: kind === MEMBER ? 'member' : 'admin',
          role_id: kind === MEMBER ? undefined : kind,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.errors) setErrors(json.errors);
        throw new Error(json.error ?? 'Could not create the account.');
      }

      toast(json.message);
      close();
      router.refresh();
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const field = (
    name: keyof typeof BLANK,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    wide = false
  ) => (
    <div className={wide ? 'field span-2' : 'field'}>
      <label htmlFor={`nm-${name}`}>{label}</label>
      <input
        id={`nm-${name}`}
        className="input"
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
        {...props}
      />
      {errors[name] && <p className="err-msg">{errors[name]}</p>}
    </div>
  );

  return (
    <>
      <button className="admin-btn" onClick={() => setOpen(true)} type="button">
        <Icon name="plus" />
        Add member
      </button>

      {open && (
        <Modal busy={busy} onClose={close} className="roomy" label="Add a member">
          <h3>Add someone to the foundation</h3>
          <p className="sub">
            For people who cannot register themselves. You set the password and give it to them.
          </p>

          <form onSubmit={submit} className="form-grid">
            {/* What kind of account. Each says what it grants, because the
                difference between them is entirely what they can reach and
                nobody should have to remember which is which. */}
            <div className="field span-2">
              <label>What kind of account?</label>
              <div className="kindchoice">
                <button
                  type="button"
                  className={`paybtn ${kind === MEMBER ? 'on' : ''}`}
                  onClick={() => setKind(MEMBER)}
                  aria-pressed={kind === MEMBER}
                >
                  <Icon name="user" />
                  Member
                </button>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`paybtn ${kind === r.id ? 'on' : ''}`}
                    onClick={() => setKind(r.id)}
                    aria-pressed={kind === r.id}
                  >
                    <Icon name={r.is_master ? 'shield' : 'lock'} />
                    {r.name}
                  </button>
                ))}
              </div>
              <p
                className="err-msg"
                style={{
                  color: chosen?.is_master ? 'var(--st-review)' : 'var(--text-faint)',
                  fontWeight: chosen?.is_master ? 600 : 500,
                }}
              >
                {kind === MEMBER
                  ? 'Applies for funds. Sees only their own applications.'
                  : (chosen?.description ??
                     `Opens whatever the ${chosen?.name ?? 'role'} role has been given.`)}
              </p>
            </div>

            {field('full_name', 'Full name', { autoComplete: 'off', required: true }, true)}

            <div className="field">
              <label htmlFor="nm-gender">Gender</label>
              <select
                id="nm-gender"
                className="input"
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
                required
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <p className="err-msg">{errors.gender}</p>}
            </div>

            {field('age', 'Age', { type: 'number', min: 12, max: 120, required: true })}
            {field('city', 'City', { required: true })}
            {field('country', 'Country', { required: true })}
            {field('email', 'Email address', {
              type: 'email',
              dir: 'ltr',
              autoComplete: 'off',
              required: true,
            })}
            {field('mobile', 'Mobile number', { dir: 'ltr', required: true, placeholder: '03xx…' })}

            <div className="field span-2">
              <label htmlFor="nm-password">
                Password <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>(give this to them)</span>
              </label>
              <input
                id="nm-password"
                className="input"
                /* Shown, not masked: the administrator has to read it out. */
                type="text"
                dir="ltr"
                autoComplete="off"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                required
              />
              <button
                type="button"
                className="admin-btn ghost"
                style={{ marginTop: 8 }}
                onClick={suggestPassword}
              >
                <Icon name="refresh" />
                Suggest one
              </button>
              {errors.password && <p className="err-msg">{errors.password}</p>}
            </div>

            <p className="note span-2" style={{ marginTop: 4 }}>
              Bank details are not needed yet. They cannot apply for a fund until those are added,
              which you or they can do from their profile.
            </p>

            <div className="btn-row mt-8 span-2">
              <button
                className="admin-btn ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={close}
                disabled={busy}
                type="button"
              >
                Cancel
              </button>
              <button
                className="admin-btn"
                style={{ flex: 1, justifyContent: 'center' }}
                disabled={busy}
                type="submit"
              >
                {busy ? <span className="spin" /> : <Icon name="check" />}
                {busy
                  ? 'Creating…'
                  : kind === MEMBER
                    ? 'Create member'
                    : `Create ${chosen?.name ?? 'account'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
