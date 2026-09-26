'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import Modal from './Modal';
import NewMemberButton from './NewMemberButton';
import { useToast } from './Toast';
import { initials } from '@/lib/format';

interface Role {
  id: string;
  name: string;
  description: string | null;
  is_master: boolean;
  capability_count: number;
}

interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  role: string;
  role_id: string | null;
  admin_level: string | null;
}

/**
 * Who administers the foundation, and as what.
 *
 * Only the people with an administrator account are listed: members are a much
 * longer list with a different job, and they live under Members. What this
 * screen is for is the handful of people who run the place and which role each
 * of them holds.
 */
export default function UsersManager({ selfId }: { selfId: string }) {
  const toast = useToast();

  const [people, setPeople] = useState<Person[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState('');

  const [assigning, setAssigning] = useState<Person | null>(null);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [peopleRes, rolesRes] = await Promise.all([
        fetch('/api/admin/members?limit=200'),
        fetch('/api/admin/roles'),
      ]);
      const peopleJson = await peopleRes.json();
      const rolesJson = await rolesRes.json();

      if (!peopleRes.ok) throw new Error(peopleJson.error);
      if (!rolesRes.ok) {
        if (rolesJson.code === 'migration_required') {
          setAvailable(false);
          return;
        }
        throw new Error(rolesJson.error);
      }

      setPeople((peopleJson.members ?? []).filter((p: Person) => p.role === 'admin'));
      setRoles(rolesJson.roles ?? []);
      setAvailable(true);
      setError('');
    } catch (e) {
      setError((e as Error).message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAssign(p: Person) {
    setAssigning(p);
    setChosen(p.role_id ?? '');
    setFormError('');
  }

  async function assign() {
    if (!assigning) return;
    if (!chosen) {
      setFormError('Choose a role.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assigning.id, role_id: chosen }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not change the role.');
      toast(`${assigning.full_name ?? 'They'} moved to ${roles.find((r) => r.id === chosen)?.name}`);
      setAssigning(null);
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const roleOf = (p: Person) =>
    roles.find((r) => r.id === p.role_id) ??
    // Not yet moved onto a role: what 0025 will give them, named.
    ({
      id: '',
      name:
        p.admin_level === 'reports'
          ? 'Admin 1'
          : p.admin_level === 'intake'
            ? 'Admin 2'
            : 'Master Admin',
      description: null,
      is_master: !p.admin_level,
      capability_count: 0,
    } as Role);

  if (!available)
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty">
            <div className="e-ico">
              <Icon name="shield" />
            </div>
            <h3>User management needs migration 0025</h3>
            <p>
              Run <code>supabase/migrations/0025_roles.sql</code>, then this page picks the roles
              up on its own. Until then everybody keeps the access they have.
            </p>
          </div>
        </div>
      </div>
    );

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Administrators</h2>
            <div className="ph-sub">
              Everyone who can sign in to this portal, and the role they hold.
            </div>
          </div>
          <NewMemberButton />
        </div>

        {error && (
          <div className="panel-body">
            <p className="err-msg mb-0">{error}</p>
          </div>
        )}

        {loading && (
          <div className="panel-body">
            <span className="sk" style={{ display: 'block', height: 120, borderRadius: 12 }} />
          </div>
        )}

        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Administrator</th>
                  <th>Role</th>
                  <th>Opens</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const role = roleOf(p);
                  const isSelf = p.id === selfId;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="who">
                          <div className="av">{initials(p.full_name ?? '?')}</div>
                          <div>
                            <div className="wn">
                              {p.full_name}
                              {isSelf && <span className="we"> — you</span>}
                            </div>
                            <div className="we" dir="ltr">
                              {p.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="gift-count">
                          {role.is_master && <Icon name="shield" />} {role.name}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>
                        {role.is_master ? 'Everything' : `${role.capability_count} capabilities`}
                      </td>
                      <td>
                        {isSelf ? (
                          // Changing your own role is how an administrator
                          // locks themselves out of the screen that could put
                          // it back. Somebody else has to do it.
                          <span className="gift-none">Ask another master</span>
                        ) : (
                          <button
                            className="admin-btn ghost small"
                            type="button"
                            onClick={() => openAssign(p)}
                          >
                            <Icon name="settings" />
                            Change role
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {assigning && (
        <Modal onClose={() => !busy && setAssigning(null)} busy={busy} label="Change role">
          <h3>Change {assigning.full_name}&rsquo;s role</h3>
          <p className="sub">
            They see whatever the new role opens, from their next click. They do not have to sign
            in again.
          </p>

          <div className="field">
            <label htmlFor="assign_role">Role</label>
            <select
              id="assign_role"
              className="input"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            >
              <option value="" disabled>
                Choose a role…
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.is_master ? ' — everything' : ` — ${r.capability_count} capabilities`}
                </option>
              ))}
            </select>
            {roles.find((r) => r.id === chosen)?.description && (
              <p className="field-hint">{roles.find((r) => r.id === chosen)?.description}</p>
            )}
          </div>

          {formError && <p className="err-msg">{formError}</p>}

          <div className="amodal-foot">
            <button
              className="admin-btn ghost"
              type="button"
              onClick={() => setAssigning(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="admin-btn" type="button" onClick={assign} disabled={busy}>
              {busy ? <span className="spin" /> : <Icon name="check" />}
              Change the role
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
