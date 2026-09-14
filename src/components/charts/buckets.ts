export type Granularity = 'day' | 'week' | 'month';

export interface AnalyticsRow {
  created_at: string;
  status: string;
  fund_type_id: string;
  amount_requested: number | string;
  amount_approved: number | string | null;
  transferred_at: string | null;
}

export interface Bucket {
  key: string;
  label: string;
  /** Full label for the tooltip, where there is room to be unambiguous. */
  title: string;
  start: Date;
  end: Date;
}

const DAY = 86400000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Monday-based week start, matching how the office talks about a week. */
function startOfWeek(d: Date) {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7;
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - dow);
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export const BUCKET_COUNT: Record<Granularity, number> = { day: 14, week: 12, month: 12 };

const fmtDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' });
const fmtFull = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A continuous run of the most recent buckets — including empty ones, so a
 * quiet week shows as a gap in the data rather than being silently skipped.
 */
export function buildBuckets(g: Granularity, now = new Date()): Bucket[] {
  const count = BUCKET_COUNT[g];
  const out: Bucket[] = [];

  for (let i = count - 1; i >= 0; i--) {
    let start: Date;
    let end: Date;
    let label: string;
    let title: string;

    if (g === 'day') {
      start = new Date(startOfDay(now).getTime() - i * DAY);
      end = new Date(start.getTime() + DAY);
      label = fmtDay.format(start);
      title = fmtFull.format(start);
    } else if (g === 'week') {
      start = new Date(startOfWeek(now).getTime() - i * 7 * DAY);
      end = new Date(start.getTime() + 7 * DAY);
      label = fmtDay.format(start);
      title = `${fmtDay.format(start)} – ${fmtDay.format(new Date(end.getTime() - DAY))}`;
    } else {
      const m = startOfMonth(now);
      start = new Date(m.getFullYear(), m.getMonth() - i, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      label = fmtMonth.format(start);
      title = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(start);
    }

    out.push({ key: start.toISOString(), label, title, start, end });
  }

  return out;
}

/** Index of the bucket a timestamp falls in, or -1 if it predates the window. */
export function bucketIndex(buckets: Bucket[], iso: string) {
  const t = new Date(iso).getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start.getTime() && t < buckets[i].end.getTime()) return i;
  }
  return -1;
}

export const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));
