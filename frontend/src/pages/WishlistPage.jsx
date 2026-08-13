import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState.jsx';
import { PageHeader } from '../components/AppShell.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { categoryLabel } from '../categories.js';
import { api } from '../services/api.js';

const PAGE_SIZE = 10;
const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const heldMinutes = (reservation) => Math.max(1, Math.round((new Date(reservation.expiresAt).getTime() - new Date(reservation.createdAt).getTime()) / 60000));

export function CustomerWishlist() {
  const { session } = useAuth();
  const { ids, toggle } = useWishlist();
  const [data, setData] = useState({ loading: true, error: null, items: [] });
  const [pagination, setPagination] = useState(null); const [page, setPage] = useState(1); const [limit, setLimit] = useState(PAGE_SIZE);
  const [quantities, setQuantities] = useState({});
  const [actionId, setActionId] = useState(null);
  const [notice, setNotice] = useState(null);
  const idempotencyKeys = useRef({});

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setData((current) => ({ ...current, loading: true, error: null }));
    try {
      const { payload } = await api.wishlist(session.token, { page, limit });
      setData({ loading: false, error: null, items: payload.items });
      setPagination(payload.pagination ?? null);
      if (payload.pagination && payload.pagination.totalPages < page) setPage(payload.pagination.totalPages);
    } catch (error) {
      setData((current) => ({ ...current, loading: false, error }));
    }
  }, [session.token, page, limit]);

  useEffect(() => { refresh(); }, [refresh]);

  // Keep availability current while the page is open.
  useEffect(() => { const timer = setInterval(() => refresh({ silent: true }), 15000); return () => clearInterval(timer); }, [refresh]);

  // Recover when a fetch raced an in-flight add: page 1 showing nothing while the shared
  // membership set has entries means the just-hearted item was missed.
  const membershipMismatch = page === 1 && data.items.length === 0 && ids.size > 0;
  useEffect(() => { if (membershipMismatch) refresh({ silent: true }); }, [membershipMismatch, refresh]);

  // Refetch when the tab regains focus so changes from other tabs appear immediately.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh({ silent: true }); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const setQuantity = (product, quantity) => {
    setNotice(null);
    setQuantities((current) => { const next = { ...current }; if (quantity <= 0) delete next[product._id]; else next[product._id] = Math.min(quantity, product.available); return next; });
  };

  const reserve = async (product) => {
    const quantity = quantities[product._id];
    if (!quantity) return;
    setActionId(product._id); setNotice(null);
    idempotencyKeys.current[product._id] ??= crypto.randomUUID();
    try {
      const { payload } = await api.createReservation(session.token, [{ productId: product._id, quantity }], idempotencyKeys.current[product._id]);
      delete idempotencyKeys.current[product._id];
      setQuantities((current) => { const next = { ...current }; delete next[product._id]; return next; });
      const minutes = heldMinutes(payload.reservation);
      setNotice({ kind: 'success', text: `${product.name} is held for ${minutes} minute${minutes === 1 ? '' : 's'}. Review it under My reservations.` });
      await refresh({ silent: true });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally { setActionId(null); }
  };

  const remove = async (product) => {
    setActionId(product._id);
    try {
      await toggle(product._id);
      await refresh({ silent: true });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally { setActionId(null); }
  };

  if (data.loading) return <LoadingState label="Loading your wishlist" />;
  if (data.error && !data.items.length) return <ErrorState error={data.error} retry={refresh} />;
  return <>
    <PageHeader eyebrow="Your saved products" title="Wishlist" detail="Saved products are not reserved — inventory is only held when you reserve. Availability below is live." />
    {notice && <div className={`notice ${notice.kind}`} role="status">{notice.text}</div>}
    {data.items.length ? <div className="reservation-list">{data.items.map(({ product, addedAt }) => {
      const available = product.isActive ? product.available : 0;
      const quantity = quantities[product._id] ?? 0;
      return <article className="reservation-row" key={product._id}>
        <div className="reservation-primary">
          <div className="reservation-title"><strong>{product.name}</strong><span className={available ? 'stock-live' : 'stock-empty'}>{available ? `${available} available` : 'Unavailable'}</span></div>
          <span>{product.sku}{categoryLabel(product.category) ? ` · ${categoryLabel(product.category)}` : ''} · {money(product.priceCents)}</span>
          <small>Saved {new Date(addedAt).toLocaleString()}</small>
        </div>
        <div className="row-actions">
          <div className="stepper"><button disabled={!quantity} onClick={() => setQuantity(product, quantity - 1)} aria-label={`Remove one ${product.name}`}>−</button><span>{quantity}</span><button disabled={!available || quantity >= available} onClick={() => setQuantity(product, quantity + 1)} aria-label={`Add one ${product.name}`}>+</button></div>
          <button className="button button-primary" disabled={actionId === product._id || !quantity} onClick={() => reserve(product)}>{actionId === product._id && quantity ? 'Securing…' : 'Reserve'}</button>
          <button className="button button-secondary" disabled={actionId === product._id} onClick={() => remove(product)}>Remove</button>
        </div>
      </article>;
    })}</div> : <EmptyState title="Nothing saved yet" detail="Add products from the catalog and reserve them here when you are ready." />}
    <Pagination pagination={pagination} onChange={setPage} onLimitChange={(next) => { setPage(1); setLimit(next); }} label="products" /></>;
}
