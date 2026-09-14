'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LocaleProvider';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n';

/**
 * EN / اردو switch. Writes a cookie and refreshes so both Server and Client
 * Components pick the new language up — no reload, no lost form state.
 */
export default function LanguageToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    // one year, site-wide
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    start(() => router.refresh());
  }

  return (
    <div
      className="lang-toggle"
      data-tone={tone}
      data-pending={pending ? '' : undefined}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        className={locale === 'en' ? 'on' : ''}
        onClick={() => choose('en')}
        lang="en"
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        className={locale === 'ur' ? 'on' : ''}
        onClick={() => choose('ur')}
        lang="ur"
        aria-pressed={locale === 'ur'}
      >
        اردو
      </button>
    </div>
  );
}
