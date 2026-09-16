'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';
import { LEVEL_LABEL, MODULES, can, type AdminLevel } from '@/lib/permissions';

interface Props {
  name: string;
  email: string;
  pending: number;
  level: AdminLevel | null;
}

export default function AdminSidebar({ name, email, pending, level }: Props) {
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
          <div className="bt">Mohammad Husnain</div>
          <div className="bs">Admin portal</div>
        </div>
      </div>

      {/* Only what this administrator may actually open. The pages refuse it
          again on the server — a hidden link is tidiness, not a rule. */}
      <nav>
        {(['Overview', 'Manage'] as const).map((group) => {
          const items = MODULES.filter((m) => m.group === group && can(level, m.needs));
          if (!items.length) return null;
          return (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {items.map((m) => (
                <Link key={m.href} href={m.href} className={on(m.href) ? 'on' : ''}>
                  <Icon name={m.icon} />
                  <span>{m.label}</span>
                  {m.href === '/admin/requests' && pending > 0 && (
                    <span className="count">{pending}</span>
                  )}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="side-foot">
        <div className="av">{initials(name)}</div>
        <div className="who">
          <div className="wn">{name}</div>
          <div className="we">{level ? LEVEL_LABEL[level] : email}</div>
        </div>
        <button className="out" onClick={signOut} aria-label="Sign out" type="button">
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}
