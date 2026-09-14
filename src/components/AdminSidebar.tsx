'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';

interface Props {
  name: string;
  email: string;
  pending: number;
}

export default function AdminSidebar({ name, email, pending }: Props) {
  const path = usePathname();
  const router = useRouter();

  const on = (p: string) => (p === '/admin' ? path === '/admin' : path.startsWith(p));

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="side">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/logo.svg" alt="" />
        <div>
          <div className="bt">Subaidar Hasnain</div>
          <div className="bs">Admin portal</div>
        </div>
      </div>

      <nav>
        <div className="nav-label">Overview</div>
        <Link href="/admin" className={on('/admin') ? 'on' : ''}>
          <Icon name="grid" />
          <span>Dashboard</span>
        </Link>

        <div className="nav-label">Manage</div>
        <Link href="/admin/requests" className={on('/admin/requests') ? 'on' : ''}>
          <Icon name="inbox" />
          <span>Applications</span>
          {pending > 0 && <span className="count">{pending}</span>}
        </Link>
        <Link href="/admin/members" className={on('/admin/members') ? 'on' : ''}>
          <Icon name="users" />
          <span>Members</span>
        </Link>
        <Link href="/admin/funds" className={on('/admin/funds') ? 'on' : ''}>
          <Icon name="wallet" />
          <span>Funds</span>
        </Link>

        <div className="nav-label">Member app</div>
        <Link href="/">
          <Icon name="phone" />
          <span>Open member app</span>
        </Link>
      </nav>

      <div className="side-foot">
        <div className="av">{initials(name)}</div>
        <div className="who">
          <div className="wn">{name}</div>
          <div className="we">{email}</div>
        </div>
        <button className="out" onClick={signOut} aria-label="Sign out" type="button">
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}
