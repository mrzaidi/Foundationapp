'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/Icon';
import LanguageToggle from '@/components/LanguageToggle';
import { useI18n } from '@/components/LocaleProvider';
import { useToast } from '@/components/Toast';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { d } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (err) {
      setBusy(false);
      setError(err.message === 'Invalid login credentials' ? d.login.badCredentials : err.message);
      return;
    }

    toast(d.login.welcome);
    router.replace(params.get('next') || '/');
    router.refresh();
  }

  return (
    <div className="screen no-nav">
      <div className="auth-hero">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <LanguageToggle />
        </div>
        <div className="mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo.svg" alt="" />
        </div>
        <h1>{d.common.appName}</h1>
        <p>{d.common.tagline}</p>
      </div>

      <div className="pad mt-24">
        <h2 style={{ fontSize: 20, fontWeight: 750, margin: '0 0 5px', letterSpacing: '-.4px' }}>
          {d.login.title}
        </h2>
        <p className="muted" style={{ margin: '0 0 20px' }}>
          {d.login.lede}
        </p>

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">{d.login.email}</label>
            <div className="input-icon">
              <Icon name="mail" />
              <input
                id="email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={d.login.emailPlaceholder}
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">{d.login.password}</label>
            <div className="input-icon">
              <Icon name="lock" />
              <input
                id="password"
                className="input"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? d.login.hidePassword : d.login.showPassword}
              >
                <Icon name={showPw ? 'eyeOff' : 'eye'} />
              </button>
            </div>
          </div>

          {error && (
            <p className="err-msg" role="alert" style={{ marginBottom: 12 }}>
              {error}
            </p>
          )}

          <button className="btn mt-8" type="submit" disabled={busy}>
            {busy ? <span className="spin" /> : <Icon name="arrowRight" className="flip" />}
            <span>{busy ? d.login.submitting : d.login.submit}</span>
          </button>
        </form>

        <p className="center muted mt-20" style={{ fontSize: 13.5 }}>
          {d.login.newHere}{' '}
          <Link href="/register" className="link">
            {d.login.createAccount}
          </Link>
        </p>

        <div className="note mt-24">
          <strong style={{ color: 'var(--text)' }}>{d.login.helpTitle}</strong> {d.login.helpBody}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="screen no-nav" />}>
      <LoginForm />
    </Suspense>
  );
}
