import type { ReactNode } from 'react';

/**
 * The frame every member-facing screen lives inside.
 *
 * On a phone this is a centred device mock; from 1024px up portal.css turns it
 * into a real portal with a sidebar. Sign-in and registration pass
 * variant="auth" because they have no navigation to sit beside.
 */
export default function PhoneShell({
  children,
  variant = 'app',
}: {
  children: ReactNode;
  variant?: 'app' | 'auth';
}) {
  return (
    <div className={`app-body${variant === 'auth' ? ' auth-body' : ''}`}>
      <div className="stage-bg" />
      <div className="phone">{children}</div>
    </div>
  );
}

/** Simulated iOS status bar — hidden on desktop, sells the app feel on a phone. */
export function StatusBar({ label = '9:41' }: { label?: string }) {
  return (
    <div className="status-bar">
      <span>{label}</span>
      <span className="dots">
        <i />
        <i />
        <i />
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none" aria-hidden="true">
          <rect x="0.6" y="0.6" width="17" height="9.8" rx="2.6" stroke="currentColor" opacity=".5" />
          <rect x="2" y="2" width="13" height="7" rx="1.6" fill="currentColor" />
          <path d="M19.4 4v3a1.9 1.9 0 0 0 0-3Z" fill="currentColor" opacity=".5" />
        </svg>
      </span>
    </div>
  );
}
