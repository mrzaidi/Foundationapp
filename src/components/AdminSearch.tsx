'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from './Icon';

/**
 * Search that answers as you type.
 *
 * It used to wait for Enter and say so nowhere, so typing into it and waiting
 * looked like a box that did not work. A button fixed the silence and added a
 * step; this removes both — the list narrows while you type.
 *
 * Two details keep that from being annoying. Keystrokes are held for a beat
 * before anything is fetched, so a five-letter name is one query rather than
 * five. And the URL is replaced rather than pushed, so Back returns to the
 * screen you came from instead of walking you out one letter at a time.
 */
export default function AdminSearch({
  placeholder,
  basePath,
}: {
  placeholder: string;
  basePath: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const applied = params.get('q') ?? '';
  const [value, setValue] = useState(applied);

  // The first render must not navigate: it would replace the URL with the one
  // already in the bar and throw away a page the person had scrolled to.
  const settled = useRef(applied);

  /** Put a term into the URL. The list is whatever the URL says it is. */
  const apply = useCallback(
    (term: string) => {
      settled.current = term;
      const p = new URLSearchParams(window.location.search);
      if (term) p.set('q', term);
      else p.delete('q');
      // A narrower list starts again at the beginning; page 3 of the old one
      // is rarely page 3 of the new one.
      p.delete('page');
      const s = p.toString();
      startTransition(() => router.replace(`${basePath}${s ? `?${s}` : ''}`, { scroll: false }));
    },
    [basePath, router]
  );

  /*
   * `params` is deliberately not a dependency here. Next hands back a fresh
   * object on every render, so including it re-ran this effect constantly and
   * the cleanup cancelled the pending timer each time — which is why clearing
   * the box emptied it and left the list where it was.
   */
  useEffect(() => {
    const term = value.trim();
    if (term === settled.current) return;
    const timer = setTimeout(() => apply(term), 300);
    return () => clearTimeout(timer);
  }, [value, apply]);

  // Somebody else changed the query — a cleared filter, the Back button — so
  // the box should show what the list is actually filtered by.
  useEffect(() => {
    settled.current = applied;
    setValue(applied);
  }, [applied]);

  return (
    <div className="search">
      {pending ? <span className="s-spin" aria-hidden="true" /> : <Icon name="search" />}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        /* Deliberately not type="search": Chrome draws its own clear cross
           inside such an input, in the same corner as ours, and the two sit on
           top of each other. */
        type="text"
        autoComplete="off"
      />
      {value !== '' && (
        <button
          type="button"
          className="s-clear"
          onClick={() => {
            setValue('');
            apply('');
          }}
          aria-label="Clear the search"
        >
          <Icon name="x" />
        </button>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? 'Searching' : ''}
      </span>
    </div>
  );
}
