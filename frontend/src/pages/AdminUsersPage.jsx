import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState.jsx';
import { PageHeader } from '../components/AppShell.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { ReservationStatus } from '../components/ReservationStatus.jsx';
import { CATEGORIES, categoryLabel } from '../categories.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { api } from '../services/api.js';

const PAGE_SIZE = 10;
const blankProduct = { sku: '', name: '', description: '', priceCents: '', onHand: '', category: 'electronics', imageUrl: '' };
const blankUser = { name: '', email: '', password: '', role: 'admin' };

export function AdminUsers() {
  const { session } = useAuth(); const { showSnackbar } = useSnackbar(); const [data, setData] = useState({ loading: true, error: null, users: [] }); const [pagination, setPagination] = useState(null); const [page, setPage] = useState(1); const [limit, setLimit] = useState(PAGE_SIZE); const [form, setForm] = useState(blankUser); const [saving, setSaving] = useState(false); const [confirmId, setConfirmId] = useState(null); const [workingId, setWorkingId] = useState(null);
  const load = useCallback(async () => { setData((current) => ({ ...current, loading: true, error: null })); try { const { payload } = await api.adminUsers(session.token, { page, limit }); setData({ loading: false, error: null, users: payload.users }); setPagination(payload.pagination ?? null); if (payload.pagination && payload.pagination.totalPages < page) setPage(payload.pagination.totalPages); } catch (error) { setData((current) => ({ ...current, loading: false, error })); } }, [session.token, page, limit]);
  useEffect(() => { load(); }, [load]);
  const add = async (event) => { event.preventDefault(); setSaving(true); try { await api.createUser(session.token, form); showSnackbar({ kind: 'success', text: `${form.name} (${form.role}) account created.` }); setForm(blankUser); if (page === 1) await load(); else setPage(1); } catch (error) { showSnackbar({ kind: 'error', text: error.message }); } finally { setSaving(false); } };
  const deactivate = async (user) => { setWorkingId(user.id); try { await api.deactivateUser(session.token, user.id); showSnackbar({ kind: 'success', text: `${user.name} deactivated.` }); setConfirmId(null); await load(); } catch (error) { showSnackbar({ kind: 'error', text: error.message }); } finally { setWorkingId(null); } };
  const reactivate = async (user) => { setWorkingId(user.id); try { await api.reactivateUser(session.token, user.id); showSnackbar({ kind: 'success', text: `${user.name} reactivated.` }); await load(); } catch (error) { showSnackbar({ kind: 'error', text: error.message }); } finally { setWorkingId(null); } };
  if (data.loading) return <LoadingState label="Loading team" />; if (data.error && !data.users.length) return <ErrorState error={data.error} retry={load} />;
  return <><PageHeader eyebrow="Operations control" title="Team" detail="Provision customer and administrator accounts. Customers can be deactivated; their history stays on record." />{data.error && <div className="notice error">{data.error.message}</div>}
    <form className="product-form" onSubmit={add}><label>Full name<input required minLength="2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Email address<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Password<input required type="password" minLength="10" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="admin">Admin</option><option value="customer">Customer</option></select></label><button className="button button-primary" disabled={saving}>{saving ? 'Adding…' : 'Add account'}</button></form>
    {data.users.length ? <div className="reservation-list">{data.users.map((user) => <article className="reservation-row" key={user.id}><div className="reservation-primary"><div className="reservation-title"><strong>{user.name}</strong><span className={`status ${user.deletedAt ? 'status-expired' : `status-${user.role}`}`}>{user.deletedAt ? 'deactivated' : user.role}</span></div><small>{user.email} · Created {new Date(user.createdAt).toLocaleString()}{user.deletedAt && ` · Deactivated ${new Date(user.deletedAt).toLocaleString()}`}</small></div>{user.role === 'customer' && !user.deletedAt && <div className="row-actions">{confirmId === user.id ? <><button className="button button-primary" disabled={workingId === user.id} onClick={() => deactivate(user)}>Confirm</button><button className="button button-secondary" disabled={workingId === user.id} onClick={() => setConfirmId(null)}>Keep</button></> : <button className="button button-secondary" onClick={() => setConfirmId(user.id)}>Deactivate</button>}</div>}{user.deletedAt && <div className="row-actions"><button className="button button-secondary" disabled={workingId === user.id} onClick={() => reactivate(user)}>Reactivate</button></div>}</article>)}</div> : <EmptyState title="No accounts yet" detail="Add the first account above." />}
    <Pagination pagination={pagination} onChange={setPage} onLimitChange={(next) => { setPage(1); setLimit(next); }} label="accounts" /></>;
}

