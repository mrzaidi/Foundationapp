'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import LanguageToggle from './LanguageToggle';
import { useI18n } from './LocaleProvider';
import { StatusBar } from './PhoneShell';
import { useToast } from './Toast';
import { createClient } from '@/lib/supabase/client';
import { dateLabel, initials, money } from '@/lib/format';
import type { Profile } from '@/lib/types';

export default function ProfileView({
  profile,
  totalRequests,
  totalReceived,
}: {
  profile: Profile;
  totalRequests: number;
  totalReceived: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { d } = useI18n();

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: profile.full_name,
    age: String(profile.age),
    country: profile.country,
    city: profile.city,
    mobile: profile.mobile,
  });

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, age: Number(form.age) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? d.profile.saveFailed);
      toast(d.profile.updated);
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function viewNic() {
    if (!profile.nic_path) return;
    try {
      const res = await fetch(`/api/documents?path=${encodeURIComponent(profile.nic_path)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast((e as Error).message || d.profile.cnicFailed, 'bad');
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="screen">
      <div className="hero">
        <StatusBar />
        <div className="appbar">
          <Link href="/" className="icon-btn" aria-label={d.common.back}>
            <Icon name="chevronLeft" className="flip" />
          </Link>
          <div style={{ flex: 1 }}>
            <h1>{d.profile.title}</h1>
          </div>
          <LanguageToggle />
          <button
            className="icon-btn"
            onClick={() => setEditing((e) => !e)}
            aria-label={editing ? d.profile.cancelEdit : d.profile.edit}
          >
            <Icon name={editing ? 'x' : 'settings'} />
          </button>
        </div>

        <div className="center mt-20">
          <div
            className="avatar"
            style={{ width: 76, height: 76, borderRadius: 26, fontSize: 25, margin: '0 auto 12px' }}
          >
            {initials(profile.full_name)}
          </div>
          <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-.3px' }}>
            {profile.full_name}
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 3 }}>
            {profile.city}, {profile.country}
          </div>
          {profile.role === 'admin' && (
            <Link
              href="/admin"
              className="badge"
              style={{
                marginTop: 10,
                background: 'rgba(255,255,255,.22)',
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              <Icon name="shield" />
              {d.profile.adminBadge}
            </Link>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
      <div className="pad overlap">
        <div className="card" style={{ display: 'flex', textAlign: 'center' }}>
          <div style={{ flex: 1 }}>
            <div className="num" style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.5px' }}>
              {totalRequests}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, fontWeight: 600 }}>
              {d.profile.applications}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1 }}>
            <div
              className="num"
              style={{
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: '-.5px',
                color: 'var(--brand-2)',
              }}
            >
              {money(totalReceived, false)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, fontWeight: 600 }}>
              {d.profile.received}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1 }}>
            <div className="num" style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.5px' }}>
              {new Date(profile.created_at).getFullYear()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, fontWeight: 600 }}>
              {d.profile.memberSince}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- details / edit ---------- */}
      <div className="pad">
        <div className="section-head">
          <h2>{editing ? d.profile.editDetails : d.profile.registrationDetails}</h2>
        </div>

        {editing ? (
          <div className="card">
            <div className="field">
              <label htmlFor="p_name">{d.register.fullName}</label>
              <input
                id="p_name"
                className="input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="row-2">
              <div className="field">
                <label htmlFor="p_age">{d.profile.age}</label>
                <input
                  id="p_age"
                  className="input"
                  type="number"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="p_city">{d.profile.city}</label>
                <input
                  id="p_city"
                  className="input"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="p_country">{d.profile.country}</label>
              <input
                id="p_country"
                className="input"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
            <div className="field mb-0">
              <label htmlFor="p_mobile">{d.profile.mobile}</label>
              <input
                id="p_mobile"
                className="input"
                dir="ltr"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </div>
            <button className="btn mt-16" onClick={save} disabled={busy} type="button">
              {busy ? <span className="spin" /> : <Icon name="check" />}
              <span>{busy ? d.common.saving : d.common.save}</span>
            </button>
          </div>
        ) : (
          <div className="card">
            <div className="kv">
              <span className="k">{d.profile.gender}</span>
              <span className="v">{d.register[profile.gender]}</span>
            </div>
            <div className="kv">
              <span className="k">{d.profile.age}</span>
              <span className="v">
                {profile.age} {d.profile.years}
              </span>
            </div>
            <div className="kv">
              <span className="k">{d.profile.country}</span>
              <span className="v">{profile.country}</span>
            </div>
            <div className="kv">
              <span className="k">{d.profile.city}</span>
              <span className="v">{profile.city}</span>
            </div>
            <div className="kv">
              <span className="k">{d.profile.email}</span>
              <span className="v" dir="ltr">
                {profile.email}
              </span>
            </div>
            <div className="kv">
              <span className="k">{d.profile.mobile}</span>
              <span className="v" dir="ltr">
                {profile.mobile}
              </span>
            </div>
            <div className="kv">
              <span className="k">{d.profile.registered}</span>
              <span className="v num">{dateLabel(profile.created_at)}</span>
            </div>
          </div>
        )}
      </div>

        </div>

        <aside className="detail-aside">
      {/* ---------- CNIC ---------- */}
      <div className="pad">
        <div className="section-head">
          <h2>{d.profile.identity}</h2>
        </div>
        {profile.nic_path ? (
          <button className="list-row" onClick={viewNic} type="button">
            <span className="li">
              <Icon name="idcard" />
            </span>
            <span className="lmid">
              <span className="lt" style={{ display: 'block' }}>
                {d.profile.cnicOnFile}
              </span>
              <span className="ld" style={{ display: 'block' }}>
                {d.profile.cnicVerified}
              </span>
            </span>
            <span className="chev">
              <Icon name="eye" />
            </span>
          </button>
        ) : (
          <div className="note">{d.profile.noCnic}</div>
        )}
      </div>

      {/* ---------- actions ---------- */}
      <div className="pad mt-8">
        <Link className="list-row" href="/requests">
          <span className="li">
            <Icon name="list" />
          </span>
          <span className="lmid">
            <span className="lt" style={{ display: 'block' }}>
              {d.profile.myApplications}
            </span>
            <span className="ld" style={{ display: 'block' }}>
              {d.profile.submittedCount(totalRequests)}
            </span>
          </span>
          <span className="chev">
            <Icon name="chevronRight" />
          </span>
        </Link>

        <Link className="list-row" href="/help">
          <span className="li">
            <Icon name="info" />
          </span>
          <span className="lmid">
            <span className="lt" style={{ display: 'block' }}>
              {d.profile.helpContact}
            </span>
            <span className="ld" style={{ display: 'block' }}>
              {d.profile.helpContactSub}
            </span>
          </span>
          <span className="chev">
            <Icon name="chevronRight" />
          </span>
        </Link>

        <div className="mt-16" style={{ display: 'flex', justifyContent: 'center' }}>
          <LanguageToggle tone="dark" />
        </div>

        <button className="btn danger-ghost mt-16" onClick={signOut} type="button">
          <Icon name="logout" />
          <span>{d.common.signOut}</span>
        </button>

        <p className="center muted mt-16" style={{ fontSize: 11 }}>
          {d.common.appName} · v1.0
        </p>
      </div>
        </aside>
      </div>
    </div>
  );
}
