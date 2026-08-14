import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState.jsx';
import { PageHeader } from '../components/AppShell.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { ReservationStatus } from '../components/ReservationStatus.jsx';
import { CATEGORIES, categoryLabel } from '../categories.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { api } from '../services/api.js';

const PAGE_SIZE = 10;
const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const heldMinutes = (reservation) => Math.max(1, Math.round((new Date(reservation.expiresAt).getTime() - new Date(reservation.createdAt).getTime()) / 60000));
const formatCountdown = (ms) => { const total = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };

const emptyDraft = () => ({ items: {}, key: null });

function readDraft(draftKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(draftKey));
    if (stored && typeof stored.items === 'object' && stored.items !== null && (stored.key === null || typeof stored.key === 'string')) return stored;
  } catch { /* corrupted storage */ }
  return null;
}

export function CustomerReservations() {
  const { session } = useAuth(); const { showSnackbar } = useSnackbar(); const [data, setData] = useState({ loading: true, error: null, reservations: [] }); const [pagination, setPagination] = useState(null); const [page, setPage] = useState(1); const [limit, setLimit] = useState(PAGE_SIZE); const [actionId, setActionId] = useState(null); const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(async ({ silent = false } = {}) => { if (!silent) setData((current) => ({ ...current, loading: true, error: null })); try { const { payload } = await api.reservations(session.token, { page, limit }); setData({ loading: false, error: null, reservations: payload.reservations }); setPagination(payload.pagination ?? null); if (payload.pagination && payload.pagination.totalPages < page) setPage(payload.pagination.totalPages); } catch (error) { setData((current) => ({ ...current, loading: false, error })); } }, [session.token, page, limit]);
  useEffect(() => { refresh(); }, [refresh]);
  const hasPending = data.reservations.some((reservation) => reservation.status === 'pending');

  // Tick every second while a hold is pending so the countdown stays live.
  useEffect(() => { if (!hasPending) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [hasPending]);

  // Silently poll so expiry-worker results (and changes from other tabs) appear without a spinner.
  useEffect(() => { if (!hasPending) return; const timer = setInterval(() => refresh({ silent: true }), 15000); return () => clearInterval(timer); }, [hasPending, refresh]);

  // Refetch when the tab regains focus so actions taken elsewhere (e.g. a reservation
  // created in the catalog moments ago) appear immediately.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh({ silent: true }); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const transition = async (reservation, type) => { setActionId(reservation._id); try { await (type === 'complete' ? api.completeReservation(session.token, reservation._id) : api.cancelReservation(session.token, reservation._id)); showSnackbar({ kind: 'success', text: type === 'complete' ? 'Reservation completed — your items are secured.' : 'Reservation released — the inventory is available again.' }); await refresh(); } catch (error) { showSnackbar({ kind: 'error', text: error.message }); } finally { setActionId(null); } };
  if (data.loading) return <LoadingState label="Loading reservations" />; if (data.error && !data.reservations.length) return <ErrorState error={data.error} retry={refresh} />;
  return <><PageHeader eyebrow="Your activity" title="My reservations" detail="Complete a pending reservation before its hold window ends, or release it early." />{data.error && <div className="notice error">{data.error.message}</div>}
    {data.reservations.length ? <div className="reservation-list">{data.reservations.map((reservation) => {
      const overdue = reservation.status === 'pending' && new Date(reservation.expiresAt).getTime() <= now;
      return <article className="reservation-row" key={reservation._id}><div className="reservation-primary"><div className="reservation-title"><strong>Reservation #{reservation._id.slice(-6).toUpperCase()}</strong>{overdue ? <span className="status status-expired">Expiring</span> : <ReservationStatus status={reservation.status} />}</div><span>{reservation.items.map((item) => `${item.name} × ${item.quantity}`).join(' · ')}</span><small>Created {new Date(reservation.createdAt).toLocaleString()}{reservation.status === 'pending' && !overdue && ` · Expires in ${formatCountdown(new Date(reservation.expiresAt).getTime() - now)}`}{overdue && ' · Hold window ended — inventory is being released'}</small></div>{reservation.status === 'pending' && !overdue && <div className="row-actions"><button className="button button-secondary" disabled={actionId === reservation._id} onClick={() => transition(reservation, 'cancel')}>Release</button><button className="button button-primary" disabled={actionId === reservation._id} onClick={() => transition(reservation, 'complete')}>Complete</button></div>}</article>;
    })}</div> : <EmptyState title="No reservations yet" detail="Reservations you create from the catalog will appear here." />}
    <Pagination pagination={pagination} onChange={setPage} onLimitChange={(next) => { setPage(1); setLimit(next); }} label="reservations" /></>;
}

