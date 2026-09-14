'use client';

import { useI18n } from './LocaleProvider';
import { STATUS_CLASS } from '@/lib/format';
import type { RequestStatus } from '@/lib/types';

export default function StatusBadge({ status }: { status: RequestStatus }) {
  const { d } = useI18n();
  return (
    <span className={`badge ${STATUS_CLASS[status]}`}>
      <i />
      {d.status[status]}
    </span>
  );
}
