'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import LanguageToggle from '@/components/LanguageToggle';
import { useI18n } from '@/components/LocaleProvider';
import { useToast } from '@/components/Toast';
import { createClient } from '@/lib/supabase/client';
import { bytes } from '@/lib/format';

const COUNTRIES = [
  'Pakistan',
  'Saudi Arabia',
  'United Arab Emirates',
  'Qatar',
  'Oman',
  'Bahrain',
  'Kuwait',
  'United Kingdom',
  'United States',
  'Canada',
  'Australia',
  'Other',
];

type Form = {
  full_name: string;
  gender: string;
  age: string;
  country: string;
  city: string;
  email: string;
  mobile: string;
  password: string;
  confirm: string;
};

const EMPTY: Form = {
  full_name: '',
  gender: '',
  age: '',
  country: 'Pakistan',
  city: '',
  email: '',
  mobile: '',
  password: '',
  confirm: '',
};

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const { d } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [nic, setNic] = useState<File | null>(null);
  const [nicPreview, setNicPreview] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof Form, v: string) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const digits = useMemo(() => f.mobile.replace(/\D/g, '').length, [f.mobile]);
  const E = d.register.errors;

  /** Collects the problems for one or more steps — submit checks several. */
  function problemsFor(steps: number[]) {
    const e: Record<string, string> = {};
    const s = { has: (n: number) => steps.includes(n) };
    if (s.has(0)) {
      if (f.full_name.trim().length < 3) e.full_name = E.fullName;
      if (!f.gender) e.gender = E.gender;
      const age = Number(f.age);
      if (!f.age || !Number.isFinite(age) || age < 12 || age > 120) e.age = E.age;
    }
    if (s.has(1)) {
      if (!f.country) e.country = E.country;
      if (f.city.trim().length < 2) e.city = E.city;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = E.email;
      if (digits < 10) e.mobile = E.mobile;
    }
    if (s.has(2)) {
      if (!nic) e.nic = E.cnic;
      if (f.password.length < 8) e.password = E.password;
      if (f.password !== f.confirm) e.confirm = E.confirm;
    }
    return e;
  }

  function validateStep(...steps: number[]) {
    const e = problemsFor(steps);
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(2, s + 1));
  }

  function onPickNic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrors((x) => ({ ...x, nic: E.fileTooBig }));
      return;
    }
    setNic(file);
    setErrors((x) => ({ ...x, nic: '' }));
    if (file.type.startsWith('image/')) setNicPreview(URL.createObjectURL(file));
  }

  async function submit() {
    if (!validateStep(2, 3)) return;
    setBusy(true);

    try {
      /* 1. create the account + profile through the API (service-role) */
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: f.full_name.trim(),
          gender: f.gender,
          age: Number(f.age),
          country: f.country,
          city: f.city.trim(),
          email: f.email.trim().toLowerCase(),
          mobile: f.mobile.trim(),
          password: f.password,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setBusy(false);
        if (json.errors) setErrors(json.errors);
        toast(json.error ?? d.common.somethingWrong, 'bad');
        return;
      }

      /* 2. sign in so the CNIC upload runs as the new user */
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: f.email.trim().toLowerCase(),
        password: f.password,
      });
      if (signInError) throw signInError;

      /* 3. upload the CNIC into the member's own storage folder */
      if (nic) {
        const uid = json.user_id as string;
        const ext = nic.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${uid}/nic/cnic-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('documents')
          .upload(path, nic, { contentType: nic.type, upsert: true });

        if (upErr) toast(E.cnicUploadFailed, 'bad');
        else await supabase.from('profiles').update({ nic_path: path }).eq('id', uid);
      }

      toast(d.register.complete);
      router.replace('/');
      router.refresh();
    } catch (err) {
      setBusy(false);
      toast((err as Error).message || d.common.somethingWrong, 'bad');
    }
  }

  return (
    <div className="screen no-nav">
      <div className="hero tight">
        <div className="appbar">
          {step === 0 ? (
            <Link href="/login" className="icon-btn" aria-label={d.common.back}>
              <Icon name="chevronLeft" className="flip" />
            </Link>
          ) : (
            <button
              className="icon-btn"
              onClick={() => setStep((s) => s - 1)}
              aria-label={d.common.back}
            >
              <Icon name="chevronLeft" className="flip" />
            </button>
          )}
          <div style={{ flex: 1 }}>
            <h1>{d.register.title}</h1>
            <div className="sub">
              {d.register.step(step + 1)} — {d.register.stepNames[step]}
            </div>
          </div>
          <LanguageToggle />
        </div>
        <div className="steps mt-16">
          <i className="on" />
          <i className={step >= 1 ? 'on' : ''} />
          <i className={step >= 2 ? 'on' : ''} />
        </div>
      </div>

      <div className="pad mt-24">
        {/* ---------------- step 1 ---------------- */}
        {step === 0 && (
          <div className="rise">
            <div className="field">
              <label htmlFor="full_name">
                {d.register.fullName} <span className="req-star">*</span>
              </label>
              <div className="input-icon">
                <Icon name="user" />
                <input
                  id="full_name"
                  className={`input ${errors.full_name ? 'err' : ''}`}
                  value={f.full_name}
                  onChange={(e) => set('full_name', e.target.value)}
                  placeholder={d.register.fullNameHint}
                  autoComplete="name"
                />
              </div>
              {errors.full_name && <p className="err-msg">{errors.full_name}</p>}
            </div>

            <div className="field">
              <label>
                {d.register.gender} <span className="req-star">*</span>
              </label>
              <div className="seg">
                {(['male', 'female', 'other'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={f.gender === g ? 'active' : ''}
                    onClick={() => set('gender', g)}
                  >
                    {d.register[g]}
                  </button>
                ))}
              </div>
              {errors.gender && <p className="err-msg">{errors.gender}</p>}
            </div>

            <div className="field">
              <label htmlFor="age">
                {d.register.age} <span className="req-star">*</span>
              </label>
              <input
                id="age"
                className={`input ${errors.age ? 'err' : ''}`}
                type="number"
                inputMode="numeric"
                min={12}
                max={120}
                value={f.age}
                onChange={(e) => set('age', e.target.value)}
                placeholder={d.register.agePlaceholder}
              />
              {errors.age && <p className="err-msg">{errors.age}</p>}
            </div>
          </div>
        )}

        {/* ---------------- step 2 ---------------- */}
        {step === 1 && (
          <div className="rise">
            <div className="row-2">
              <div className="field">
                <label htmlFor="country">
                  {d.register.country} <span className="req-star">*</span>
                </label>
                <select
                  id="country"
                  className={`input ${errors.country ? 'err' : ''}`}
                  value={f.country}
                  onChange={(e) => set('country', e.target.value)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {errors.country && <p className="err-msg">{errors.country}</p>}
              </div>

              <div className="field">
                <label htmlFor="city">
                  {d.register.city} <span className="req-star">*</span>
                </label>
                <input
                  id="city"
                  className={`input ${errors.city ? 'err' : ''}`}
                  value={f.city}
                  onChange={(e) => set('city', e.target.value)}
                  placeholder={d.register.cityPlaceholder}
                  autoComplete="address-level2"
                />
                {errors.city && <p className="err-msg">{errors.city}</p>}
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">
                {d.register.email} <span className="req-star">*</span>
              </label>
              <div className="input-icon">
                <Icon name="mail" />
                <input
                  id="email"
                  className={`input ${errors.email ? 'err' : ''}`}
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  value={f.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              {errors.email && <p className="err-msg">{errors.email}</p>}
            </div>

            <div className="field">
              <label htmlFor="mobile">
                {d.register.mobile} <span className="req-star">*</span>
              </label>
              <div className="input-icon">
                <Icon name="phone" />
                <input
                  id="mobile"
                  className={`input ${errors.mobile ? 'err' : ''}`}
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={f.mobile}
                  onChange={(e) => set('mobile', e.target.value)}
                  placeholder={d.register.mobilePlaceholder}
                  autoComplete="tel"
                />
              </div>
              {errors.mobile && <p className="err-msg">{errors.mobile}</p>}
            </div>
          </div>
        )}

        {/* ---------------- step 3 ---------------- */}
        {step === 2 && (
          <div className="rise">
            <div className="field">
              <label>
                {d.register.cnic} <span className="req-star">*</span>
              </label>
              <label className="upload" htmlFor="nic">
                <div className="u-ico">
                  <Icon name={nic ? 'checkCircle' : 'idcard'} />
                </div>
                <div className="u-t">{nic ? d.register.cnicChange : d.register.cnicUpload}</div>
                <div className="u-d">{d.register.cnicHint}</div>
                <input
                  id="nic"
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={onPickNic}
                />
              </label>
              {nic && (
                <div className="filelist">
                  <div className="fileitem">
                    {nicPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="thumb" src={nicPreview} alt="" />
                    ) : (
                      <div className="fi">
                        <Icon name="file" />
                      </div>
                    )}
                    <div className="fmid">
                      <div className="fn" dir="ltr">
                        {nic.name}
                      </div>
                      <div className="fs">{bytes(nic.size)}</div>
                    </div>
                    <button
                      type="button"
                      className="rm"
                      aria-label={d.register.removeFile}
                      onClick={() => {
                        setNic(null);
                        setNicPreview('');
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                </div>
              )}
              {errors.nic && <p className="err-msg">{errors.nic}</p>}
            </div>

            <div className="field">
              <label htmlFor="password">
                {d.register.password} <span className="req-star">*</span>
              </label>
              <div className="input-icon">
                <Icon name="lock" />
                <input
                  id="password"
                  className={`input ${errors.password ? 'err' : ''}`}
                  type="password"
                  dir="ltr"
                  value={f.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder={d.register.passwordHint}
                  autoComplete="new-password"
                />
              </div>
              {errors.password && <p className="err-msg">{errors.password}</p>}
            </div>

            <div className="field">
              <label htmlFor="confirm">
                {d.register.confirm} <span className="req-star">*</span>
              </label>
              <div className="input-icon">
                <Icon name="lock" />
                <input
                  id="confirm"
                  className={`input ${errors.confirm ? 'err' : ''}`}
                  type="password"
                  dir="ltr"
                  value={f.confirm}
                  onChange={(e) => set('confirm', e.target.value)}
                  placeholder={d.register.confirmHint}
                  autoComplete="new-password"
                />
              </div>
              {errors.confirm && <p className="err-msg">{errors.confirm}</p>}
            </div>

            <div className="note">{d.register.privacy}</div>
          </div>
        )}

        <button
          className="btn mt-20"
          onClick={step === 2 ? submit : next}
          disabled={busy}
          type="button"
        >
          {busy ? (
            <span className="spin" />
          ) : (
            <Icon name={step === 2 ? 'checkCircle' : 'arrowRight'} className={step === 2 ? undefined : 'flip'} />
          )}
          <span>
            {busy ? d.register.submitting : step === 2 ? d.register.submit : d.common.continue}
          </span>
        </button>

        <p className="center muted mt-16" style={{ fontSize: 13 }}>
          {d.register.already}{' '}
          <Link href="/login" className="link">
            {d.register.signIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
