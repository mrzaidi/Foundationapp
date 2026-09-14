'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from './Icon';

/** Search box that pushes `?q=` onto the current admin list route. */
export default function AdminSearch({
  placeholder,
  basePath,
}: {
  placeholder: string;
  basePath: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams(params.toString());
    if (value.trim()) p.set('q', value.trim());
    else p.delete('q');
    p.delete('page');
    const s = p.toString();
    router.push(`${basePath}${s ? `?${s}` : ''}`);
  }

  return (
    <form className="search" onSubmit={submit}>
      <Icon name="search" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </form>
  );
}
