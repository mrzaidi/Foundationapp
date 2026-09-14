'use client';

import Icon from './Icon';
import { useI18n } from './LocaleProvider';
import { PIPELINE, stageIndex } from '@/lib/format';
import type { RequestEvent, RequestStatus } from '@/lib/types';

const STEP_ICON: Record<string, string> = {
  requested: 'send',
  review: 'search',
  accepted: 'checkCircle',
  transferred: 'wallet',
};

/**
 * The four-stage progress bar the member sees:
 * Requested → Review → Accepted → Transferred.
 */
export default function Tracker({
  status,
  events = [],
}: {
  status: RequestStatus;
  events?: RequestEvent[];
}) {
  const { d } = useI18n();

  if (status === 'rejected') {
    return (
      <div className="track">
        <div className="step done">
          <div className="dot">
            <Icon name="send" />
          </div>
          <div className="lbl">{d.status.requested}</div>
        </div>
        <div className="step done" style={{ flex: 3 }}>
          <div className="dot" style={{ background: 'var(--danger)', color: '#fff' }}>
            <Icon name="x" />
          </div>
          <div className="lbl">{d.status.rejected}</div>
        </div>
      </div>
    );
  }

  const current = stageIndex(status);

  return (
    <div className="track">
      {PIPELINE.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : '';
        const ev = events.find((e) => e.status === s);
        return (
          <div className={`step ${state}`} key={s}>
            <div className="dot">
              <Icon name={i <= current ? STEP_ICON[s] : 'clock'} strokeWidth={2.2} />
            </div>
            <div className="lbl">{d.status[s]}</div>
            {ev && (
              <div className="when" lang="en" dir="ltr">
                {new Date(ev.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
