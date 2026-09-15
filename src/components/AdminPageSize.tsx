'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/pagination';

/** Rows per page, kept in the URL so a filtered view can be shared as-is. */
export default function AdminPageSize({ basePath, value }: { basePath: string; value: number }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <label className="pagesize">
      <span>Rows</span>
      <select
        value={value}
        aria-label="Rows per page"
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          const n = Number(e.target.value);
          // 25 is the default, so it does not need to be in the URL.
          n === DEFAULT_PAGE_SIZE ? p.delete('size') : p.set('size', String(n));
          p.delete('page');
          const s = p.toString();
          router.push(`${basePath}${s ? `?${s}` : ''}`);
        }}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
