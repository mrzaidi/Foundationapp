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

/*
 * There used to be a simulated iOS status bar here — a clock reading 9:41 and
 * a battery icon, drawn at the top of every screen.
 *
 * It was hidden from 1024px up, which is where the desktop mock it was meant
 * to decorate actually lives. So the only place it ever appeared was a real
 * phone, a few pixels under that phone's real status bar, telling every member
 * that the time was 9:41. A fake clock is not a design flourish on a device
 * that has a true one; it is simply wrong, and it was wrong for everybody who
 * ever used the portal on a handset.
 */
