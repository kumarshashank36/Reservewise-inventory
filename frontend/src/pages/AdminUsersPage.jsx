import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState.jsx';
import { PageHeader } from '../components/AppShell.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { patchSearchParams } from '../url.js';
import { api } from '../services/api.js';

const PAGE_SIZE = 10;
const blankUser = { name: '', email: '', password: '', role: 'admin' };

export function AdminUsers() {
  const { session } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');
  const limit = Number(searchParams.get('limit') ?? String(PAGE_SIZE));
  const setParam = (patch) => patchSearchParams(setSearchParams, patch);
  const [data, setData] = useState({ loading: true, error: null, users: [] });
  const [pagination, setPagination] = useState(null);
  const [form, setForm] = useState(blankUser);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [workingId, setWorkingId] = useState(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    setData((current) => ({ ...current, loading: true, error: null }));
    try {
      const { payload } = await api.adminUsers(session.token, { page, limit });
      setData({ loading: false, error: null, users: payload.users });
      setPagination(payload.pagination ?? null);
      if (payload.pagination && payload.pagination.totalPages < page)
        setParam({ page: payload.pagination.totalPages === 1 ? null : payload.pagination.totalPages });
    } catch (error) {
      setData((current) => ({ ...current, loading: false, error }));
    }
  }, [session.token, page, limit]);
  useEffect(() => {
    load();
  }, [load]);
  const openCreate = () => {
    setForm(blankUser);
    setOpen(true);
  };
  const closeForm = () => {
    setOpen(false);
    setForm(blankUser);
  };
  const add = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createUser(session.token, form);
      showSnackbar({ kind: 'success', text: `${form.name} (${form.role}) account created.` });
      closeForm();
      if (page === 1) await load();
      else setParam({ page: null });
    } catch (error) {
      showSnackbar({ kind: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };
  const deactivate = async (user) => {
    setWorkingId(user.id);
    try {
      await api.deactivateUser(session.token, user.id);
      showSnackbar({ kind: 'success', text: `${user.name} deactivated.` });
      setConfirmId(null);
      await load();
    } catch (error) {
      showSnackbar({ kind: 'error', text: error.message });
    } finally {
      setWorkingId(null);
    }
  };
  const reactivate = async (user) => {
    setWorkingId(user.id);
    try {
      await api.reactivateUser(session.token, user.id);
      showSnackbar({ kind: 'success', text: `${user.name} reactivated.` });
      await load();
    } catch (error) {
      showSnackbar({ kind: 'error', text: error.message });
    } finally {
      setWorkingId(null);
    }
  };
  if (data.loading) return <LoadingState label="Loading team" />;
  if (data.error && !data.users.length) return <ErrorState error={data.error} retry={load} />;
  return (
    <>
      <PageHeader
        eyebrow="Operations control"
        title="Team"
        detail="Provision customer and administrator accounts. Customers can be deactivated; their history stays on record."
        action={
          <button className="button button-primary" onClick={openCreate}>
            Add account
          </button>
        }
      />
      {data.error && <div className="notice error">{data.error.message}</div>}
      <Dialog open={open} wide title="Add account" onClose={closeForm}>
        <form className="product-form" onSubmit={add}>
          <label>
            Full name
            <input
              required
              minLength="2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Email address
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              minLength="10"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="admin">Admin</option>
              <option value="customer">Customer</option>
            </select>
          </label>
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={closeForm}>
              Cancel
            </button>
            <button className="button button-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Create account'}
            </button>
          </div>
        </form>
      </Dialog>
      {data.users.length ? (
        <div className="reservation-list">
          {data.users.map((user) => (
            <article className="reservation-row" key={user.id}>
              <div className="reservation-primary">
                <div className="reservation-title">
                  <span className="flex min-w-0 items-center gap-2">
                    <strong>{user.name}</strong>
                    <span className={`status ${user.deletedAt ? 'status-expired' : `status-${user.role}`}`}>
                      {user.deletedAt ? 'deactivated' : user.role}
                    </span>
                  </span>
                </div>
                <small>
                  {user.email} · Created {new Date(user.createdAt).toLocaleString()}
                  {user.deletedAt && ` · Deactivated ${new Date(user.deletedAt).toLocaleString()}`}
                </small>
              </div>
              {user.role === 'customer' && !user.deletedAt && (
                <div className="row-actions">
                  {confirmId === user.id ? (
                    <>
                      <button
                        className="button button-primary"
                        disabled={workingId === user.id}
                        onClick={() => deactivate(user)}
                      >
                        Confirm
                      </button>
                      <button
                        className="button button-secondary"
                        disabled={workingId === user.id}
                        onClick={() => setConfirmId(null)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button className="button button-secondary" onClick={() => setConfirmId(user.id)}>
                      Deactivate
                    </button>
                  )}
                </div>
              )}
              {user.deletedAt && (
                <div className="row-actions">
                  <button
                    className="button button-secondary"
                    disabled={workingId === user.id}
                    onClick={() => reactivate(user)}
                  >
                    Reactivate
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No accounts yet" detail="Add the first account above." />
      )}
      <Pagination
        pagination={pagination}
        onChange={(next) => setParam({ page: next === 1 ? null : next })}
        onLimitChange={(next) => setParam({ limit: next === PAGE_SIZE ? null : next, page: null })}
        label="accounts"
      />
    </>
  );
}
