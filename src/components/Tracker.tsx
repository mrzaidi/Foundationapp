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

  // Two equal steps, not one wide one. The connector is drawn on each step as
  // `left: -50%; width: 100%`, which lands exactly between two dot centres only
  // while the steps are the same width — a `flex: 3` second step sent the bar
  // shooting out past the left edge of the component.
  if (status === 'rejected') {
    return (
      <div className="track">
        <div className="step done">
          <div className="dot">
            <Icon name="send" />
          </div>
          <div className="lbl">{d.status.requested}</div>
        </div>
        <div className="step done rejected">
          <div className="dot">
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
