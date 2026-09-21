'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

export interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  city: string | null;
}

/**
 * Type-to-search over registered members.
 *
 * The list comes from the server on every keystroke rather than being fetched
 * once and filtered here: the roll only grows, and a picker that quietly stops
 * showing people past the first page is worse than one that waits 200ms.
 * Members already added as donors are excluded server-side, so the list is what
 * can actually be picked.
 */
/**
 * Which roll to search.
 *
 * `donors` is the one this picker was written for: members not yet added as
 * donors, so the list is exactly what can be picked. `members` is everybody on
 * the roll, for filing an application on someone's behalf — there the point is
 * to reach any member at all, including one who is already a donor.
 */
export type PickerSource = 'donors' | 'members';

export default function MemberPicker({
  value,
  onPick,
  source = 'donors',
  placeholder = 'Search by name, email or mobile…',
}: {
  value: Candidate | null;
  onPick: (member: Candidate | null) => void;
  source?: PickerSource;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Candidate[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const q = encodeURIComponent(query.trim());
        const res = await fetch(
          source === 'members'
            ? `/api/admin/members?limit=10&q=${q}`
            : `/api/admin/donors?candidates=1&q=${q}`
        );
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          // Both endpoints answer with the same fields; only the key differs.
          setItems(source === 'members' ? (json.members ?? []) : (json.candidates ?? []));
          setFailed('');
        } else {
          setItems([]);
          // Distinguish "nobody matches" from "the lookup is not there yet":
          // the first is an answer, the second is a missing migration.
          setFailed(
            /donor_candidates|schema cache|does not exist/i.test(json.error ?? "")
              ? 'Member search needs migration 0012. Run supabase/SETUP.sql.'
              : (json.error ?? 'Could not search members.')
          );
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setFailed('Could not search members.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value, source]);

  // Clicking anywhere else closes the list.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (value) {
    return (
      <div className="picked">
        <span className="picked-av">{value.full_name.slice(0, 1).toUpperCase()}</span>
        <span className="picked-who">
          <span className="picked-name">{value.full_name}</span>
          <span className="picked-sub" dir="ltr">
            {value.mobile || value.email || ''}
          </span>
        </span>
        <button
          type="button"
          className="picked-clear"
          aria-label={`Choose someone other than ${value.full_name}`}
          onClick={() => {
            onPick(null);
            setQuery('');
            setOpen(true);
          }}
        >
          <Icon name="x" />
        </button>
      </div>
    );
  }

  return (
    <div className="mpicker" ref={box}>
      <div className="input-icon">
        <Icon name="search" />
        <input
          className="input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label={placeholder}
          autoComplete="off"
        />
      </div>

      {open && (
        <div className="mpicker-list" role="listbox">
          {loading && <div className="mpicker-note">Searching…</div>}

          {!loading && failed && <div className="mpicker-note bad">{failed}</div>}

          {!loading && !failed && items.length === 0 && (
            <div className="mpicker-note">
              {query.trim()
                ? 'No member matches — everyone who does is already a donor.'
                : 'Every registered member is already a donor.'}
            </div>
          )}

          {!loading &&
            !failed &&
            items.map((m) => (
              <button
                key={m.id}
                type="button"
                className="mpicker-item"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                }}
              >
                <span className="mpi-av">{m.full_name.slice(0, 1).toUpperCase()}</span>
                <span className="mpi-text">
                  <span className="mpi-name">{m.full_name}</span>
                  <span className="mpi-sub" dir="ltr">
                    {[m.mobile, m.email].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {m.city && <span className="mpi-city">{m.city}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
