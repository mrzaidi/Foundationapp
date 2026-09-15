'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApply } from './ApplyProvider';
import Icon from './Icon';
import { useI18n } from './LocaleProvider';

/**
 * One nav, two shapes. On a phone it is the bottom tab bar; from 1024px up
 * portal.css lays the same markup out as a top bar and reveals the brand
 * lockup, which has no place on a handset.
 */
export default function BottomNav() {
  const path = usePathname();
  const { openPicker } = useApply();
  const { d } = useI18n();
  const on = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));

  return (
    <nav className="nav">
      <Link href="/" className="portal-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/logo.svg" alt="" />
        <span className="pb-text">
          <b>{d.common.appName}</b>
          <span>{d.common.memberPortal}</span>
        </span>
      </Link>

      <Link href="/" className={on('/') ? 'on' : ''}>
        <span className="nav-ico">
          <Icon name="home" />
        </span>
        {d.nav.home}
      </Link>
      <Link href="/requests" className={on('/requests') ? 'on' : ''}>
        <span className="nav-ico">
          <Icon name="list" />
        </span>
        {d.nav.requests}
      </Link>

      <div className="fab-wrap">
        <button
          className="fab"
          aria-label={d.nav.apply}
          data-label={d.common.apply}
          onClick={openPicker}
        >
          <Icon name="plus" strokeWidth={2.4} />
        </button>
      </div>

      <Link href="/help" className={on('/help') ? 'on' : ''}>
        <span className="nav-ico">
          <Icon name="info" />
        </span>
        {d.nav.help}
      </Link>
      <Link href="/profile" className={on('/profile') ? 'on' : ''}>
        <span className="nav-ico">
          <Icon name="user" />
        </span>
        {d.nav.profile}
      </Link>
    </nav>
  );
}
