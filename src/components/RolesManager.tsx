'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import Modal from './Modal';
import { useToast } from './Toast';
import {
  ALL_CAPABILITIES,
  CAPABILITY_LABEL,
  MODULES_FOR,
  type Capability,
} from '@/lib/permissions';

interface Role {
  id: string;
  name: string;
  description: string | null;
  is_master: boolean;
  capabilities: Capability[];
  capability_count: number;
}

/**
 * The capabilities, in the order somebody reading down them would expect:
 * what you can see first, then what you can change, then the two that hand out
 * power. Grouping by module would scatter "see" and "edit" apart.
 */
const GROUPS: { title: string; note: string; caps: Capability[] }[] = [
  {
    title: 'What they can see',
    note: 'Each of these turns a section on in the sidebar.',
    caps: [
      'view_dashboard',
      'view_requests',
      'view_members',
      'view_funds',
      'view_donors',
      'view_budget',
      'view_accounts',
    ],
  },
  {
    title: 'What they can change',
    note: 'Only reachable in a section they can already see.',
    caps: [
      'create_members',
      'edit_members',
      'file_requests',
      'decide_requests',
      'edit_donors',
      'edit_funds',
      'export_reports',
      'use_assistant_writes',
    ],
  },
  {
    title: 'What they can hand out',
    note: 'Give these only to people who run the foundation.',
    caps: ['create_admins', 'manage_roles'],
  },
];

const EMPTY = { name: '', description: '', capabilities: [] as Capability[] };

export default function RolesManager() {
  const toast = useToast();

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/roles');
      const json = await res.json();
      if (!res.ok) {
        if (json.code === 'migration_required') {
          setAvailable(false);
          return;
        }
        throw new Error(json.error);
      }
      setRoles(json.roles ?? []);
      setAvailable(true);
      setError('');
    } catch (e) {
      setError((e as Error).message || 'Could not load the roles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setDraft(EMPTY);
    setEditing(null);
    setCreating(true);
    setFormError('');
  }

  function openEdit(role: Role) {
    setDraft({
      name: role.name,
      description: role.description ?? '',
      capabilities: [...role.capabilities],
    });
    setEditing(role);
    setCreating(false);
    setFormError('');
  }

  function close() {
    if (busy) return;
    setEditing(null);
    setCreating(false);
    setDraft(EMPTY);
    setFormError('');
  }

  const toggle = (c: Capability) =>
    setDraft((d) => ({
      ...d,
      capabilities: d.capabilities.includes(c)
        ? d.capabilities.filter((x) => x !== c)
        : [...d.capabilities, c],
    }));

  const toggleGroup = (caps: Capability[]) =>
    setDraft((d) => {
      const allOn = caps.every((c) => d.capabilities.includes(c));
      return {
        ...d,
        capabilities: allOn
          ? d.capabilities.filter((c) => !caps.includes(c))
          : [...new Set([...d.capabilities, ...caps])],
      };
    });

  async function save() {
    if (draft.name.trim().length < 2) {
      setFormError('Name the role.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/roles', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          name: draft.name.trim(),
          description: draft.description.trim(),
          capabilities: draft.capabilities,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save the role.');
      toast(editing ? `${draft.name.trim()} updated` : `${draft.name.trim()} created`);
      close();
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(role: Role) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/roles?id=${role.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not remove the role.');
      toast(`${role.name} removed`);
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (!available)
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty">
            <div className="e-ico">
              <Icon name="lock" />
            </div>
            <h3>Roles need migration 0025</h3>
            <p>
              Run <code>supabase/migrations/0025_roles.sql</code>, then this page picks the roles
              up on its own — no redeploy. Until then everybody keeps the access they have.
            </p>
          </div>
        </div>
      </div>
    );

  const open = creating || editing !== null;

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Roles</h2>
            <div className="ph-sub">
              A role is a job. Tick what it opens, and everyone who holds it sees exactly that.
            </div>
          </div>
          <button className="admin-btn" type="button" onClick={openNew}>
            <Icon name="plus" />
            New role
          </button>
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
                  <th>Role</th>
                  <th>Opens</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="who">
                        <div className="av">
                          <Icon name={r.is_master ? 'shield' : 'lock'} />
                        </div>
                        <div>
                          <div className="wn">{r.name}</div>
                          {r.description && <div className="we">{r.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {r.is_master ? (
                        <span className="gift-count">Everything, always</span>
                      ) : (
                        <span className="gift-count">
                          {r.capability_count} of {ALL_CAPABILITIES.length}
                        </span>
                      )}
                    </td>
                    <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {r.is_master ? (
                        <span className="gift-none">Fixed</span>
                      ) : (
                        <>
                          <button
                            className="admin-btn ghost small"
                            type="button"
                            onClick={() => openEdit(r)}
                          >
                            <Icon name="settings" />
                            Edit
                          </button>
                          <button
                            className="admin-btn ghost small"
                            type="button"
                            disabled={busy}
                            onClick={() => void remove(r)}
                          >
                            <Icon name="x" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <Modal onClose={close} busy={busy} className="roomy pinned" label="Role">
          <h3>{editing ? `Edit ${editing.name}` : 'New role'}</h3>
          <p className="sub">
            Everyone holding this role sees exactly what is ticked here, and nothing else. Changes
            take effect on their next click — nobody has to sign in again.
          </p>

          <div className="amodal-scroll">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="role_name">
                  Name <span className="req-star">*</span>
                </label>
                <input
                  id="role_name"
                  className="input"
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Treasurer, Intake clerk…"
                />
              </div>
              <div className="field">
                <label htmlFor="role_desc">What this job is</label>
                <input
                  id="role_desc"
                  className="input"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Shown wherever the role is offered"
                />
              </div>

              {GROUPS.map((g) => {
                const allOn = g.caps.every((c) => draft.capabilities.includes(c));
                return (
                  <div className="span-2" key={g.title} style={{ marginTop: 6 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <label style={{ marginBottom: 2 }}>{g.title}</label>
                      <button
                        type="button"
                        className="rowlink"
                        onClick={() => toggleGroup(g.caps)}
                      >
                        {allOn ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <p className="field-hint" style={{ marginTop: 0 }}>
                      {g.note}
                    </p>

                    <div className="capgrid">
                      {g.caps.map((c) => {
                        const on = draft.capabilities.includes(c);
                        const opens = MODULES_FOR[c];
                        return (
                          <button
                            key={c}
                            type="button"
                            className={`capbox ${on ? 'on' : ''}`}
                            aria-pressed={on}
                            onClick={() => toggle(c)}
                          >
                            <span className="capmark">
                              {on && <Icon name="check" />}
                            </span>
                            <span>
                              <span className="capname">{CAPABILITY_LABEL[c]}</span>
                              {opens && (
                                <span className="capmod">Opens {opens.join(' and ')}</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {formError && <p className="err-msg">{formError}</p>}
          </div>

          <div className="amodal-foot">
            <button className="admin-btn ghost" type="button" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button className="admin-btn" type="button" onClick={save} disabled={busy}>
              {busy ? <span className="spin" /> : <Icon name="check" />}
              {editing ? 'Save the role' : 'Create the role'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
