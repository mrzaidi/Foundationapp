import type { RequestStatus } from './types';

export const CURRENCY = 'PKR';

export function money(amount: number | null | undefined, withCode = true) {
  if (amount === null || amount === undefined) return '—';
  const n = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(amount);
  return withCode ? `${CURRENCY} ${n}` : n;
}

export function shortMoney(amount: number | null | undefined) {
  if (!amount) return '0';
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return String(amount);
}

export function dateLabel(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function dateTimeLabel(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return dateLabel(iso);
}

export function bytes(n: number | null | undefined) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** The member-facing pipeline, in the order the tracker draws it. */
export const PIPELINE: RequestStatus[] = ['requested', 'review', 'accepted', 'transferred'];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  requested: 'Requested',
  review: 'Review',
  accepted: 'Accepted',
  transferred: 'Transferred',
  rejected: 'Rejected',
};

export const STATUS_CLASS: Record<RequestStatus, string> = {
  requested: 'b-requested',
  review: 'b-review',
  accepted: 'b-accepted',
  transferred: 'b-transferred',
  rejected: 'b-rejected',
};

export const STATUS_COLOR: Record<RequestStatus, string> = {
  requested: 'var(--st-requested)',
  review: 'var(--st-review)',
  accepted: 'var(--st-accepted)',
  transferred: 'var(--st-transfer)',
  rejected: 'var(--danger)',
};

export const STATUS_BLURB: Record<RequestStatus, string> = {
  requested: 'Your application has been received by the foundation.',
  review: 'The committee is reviewing your documents and details.',
  accepted: 'Approved. The transfer is being arranged.',
  transferred: 'Funds have been transferred to you.',
  rejected: 'This application could not be approved.',
};

/** How far along the 4-stage tracker a status sits (0-based; -1 for rejected). */
export function stageIndex(status: RequestStatus) {
  return PIPELINE.indexOf(status);
}

export function progressPercent(status: RequestStatus) {
  if (status === 'rejected') return 100;
  const i = stageIndex(status);
  return ((i + 1) / PIPELINE.length) * 100;
}
