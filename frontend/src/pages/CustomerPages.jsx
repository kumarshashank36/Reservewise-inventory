import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState.jsx';
import { PageHeader } from '../components/AppShell.jsx';
import { ReservationStatus } from '../components/ReservationStatus.jsx';
import { api } from '../services/api.js';

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

export function CustomerCatalog() {
  const { session } = useAuth();
  const { ids: wishlistIds, toggle: toggleWishlist } = useWishlist();
  const draftKey = `reservewise.draft.${session.user.id}`;
  const [products, setProducts] = useState([]); const [state, setState] = useState({ loading: true, error: null });
  // The draft (selections + the pending idempotency key) survives navigation and refreshes.
  const idempotencyKey = useRef(null);
  const [draft, setDraft] = useState(() => { const restored = readDraft(draftKey); if (restored) idempotencyKey.current = restored.key; return restored ?? emptyDraft(); });
  const [submitting, setSubmitting] = useState(false); const [notice, setNotice] = useState(null);
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* storage unavailable */ } }, [draft, draftKey]);
  const load = useCallback(async () => {
    setState({ loading: true, error: null });
    try {
      const { payload } = await api.products(session.token);
      setProducts(payload.products);
      // Clamp the restored draft to the live catalog: drop lines whose product is gone
      // or sold out, cap quantities at current availability, and drop any stale key.
      setDraft((current) => {
        const items = { ...current.items };
        let changed = false;
        for (const [id, quantity] of Object.entries(items)) {
          const product = payload.products.find((candidate) => candidate._id === id);
          if (!product || product.available <= 0) { delete items[id]; changed = true; }
          else if (quantity > product.available) { items[id] = product.available; changed = true; }
        }
        if (changed) idempotencyKey.current = null;
        return changed ? { items, key: null } : current;
      });
    } catch (error) { setState({ loading: false, error }); return; }
    setState({ loading: false, error: null });
  }, [session.token]);
  useEffect(() => { load(); }, [load]);
  const lines = useMemo(() => products.filter((product) => draft.items[product._id]).map((product) => ({ product, quantity: draft.items[product._id] })), [products, draft.items]);
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);
  const setQuantity = (product, quantity) => { setNotice(null); idempotencyKey.current = null; setDraft((current) => { const items = { ...current.items }; if (quantity <= 0) delete items[product._id]; else items[product._id] = Math.min(quantity, product.available); return { items, key: null }; }); };
  const onWishlistToggle = async (product) => { setNotice(null); try { await toggleWishlist(product._id); } catch (error) { setNotice({ kind: 'error', text: error.message }); } };
  const reserve = async () => {
    if (!lines.length) return;
    setSubmitting(true); setNotice(null);
    // The key lives with the draft, so a retry after navigation still replays the
    // original reservation. The ref guards against double-submits in the same render.
    idempotencyKey.current ??= crypto.randomUUID();
    const key = idempotencyKey.current;
    if (!draft.key) setDraft((current) => ({ ...current, key }));
    try {
      const { payload } = await api.createReservation(session.token, lines.map(({ product, quantity }) => ({ productId: product._id, quantity })), key);
      idempotencyKey.current = null; setDraft(emptyDraft());
      const minutes = heldMinutes(payload.reservation);
      setNotice({ kind: 'success', text: `Your inventory is held for ${minutes} minute${minutes === 1 ? '' : 's'}. Review it under My reservations.` });
      await load();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setSubmitting(false); }
  };
  if (state.loading) return <LoadingState label="Loading catalog" />; if (state.error) return <ErrorState error={state.error} retry={load} />;
  return <><PageHeader eyebrow="Customer catalog" title="Available inventory" detail="Select quantities to place a ten-minute, protected hold." />
    {notice && <div className={`notice ${notice.kind}`} role="status">{notice.text}</div>}
    <div className="catalog-layout"><section className="product-grid">{products.length ? products.map((product) => <article className="product-card" key={product._id}><div className="product-card-top"><span className="sku">{product.sku}</span><button className={`wishlist-button${wishlistIds.has(product._id) ? ' saved' : ''}`} aria-pressed={wishlistIds.has(product._id)} aria-label={`${wishlistIds.has(product._id) ? 'Remove' : 'Add'} ${product.name} ${wishlistIds.has(product._id) ? 'from' : 'to'} wishlist`} onClick={() => onWishlistToggle(product)}>{wishlistIds.has(product._id) ? '♥' : '♡'}</button><span className={product.available ? 'stock-live' : 'stock-empty'}>{product.available ? `${product.available} available` : 'Unavailable'}</span></div><h2>{product.name}</h2><p>{product.description || 'No description provided.'}</p><div className="product-card-footer"><strong>{money(product.priceCents)}</strong><div className="stepper"><button disabled={!draft.items[product._id]} onClick={() => setQuantity(product, (draft.items[product._id] ?? 0) - 1)} aria-label={`Remove one ${product.name}`}>−</button><span>{draft.items[product._id] ?? 0}</span><button disabled={!product.available || (draft.items[product._id] ?? 0) >= product.available} onClick={() => setQuantity(product, (draft.items[product._id] ?? 0) + 1)} aria-label={`Add one ${product.name}`}>+</button></div></div></article>) : <EmptyState title="No inventory is available" detail="Check back when your operations team adds active products." />}</section>
      <aside className="cart-panel"><div><p className="eyebrow">Reservation draft</p><h2>{itemCount ? `${itemCount} unit${itemCount === 1 ? '' : 's'} selected` : 'Your selection is empty'}</h2></div>{lines.length ? <><div className="cart-lines">{lines.map(({ product, quantity }) => <div key={product._id}><span>{product.name} <small>× {quantity}</small></span><strong>{money(product.priceCents * quantity)}</strong></div>)}</div><button className="button button-primary form-submit" disabled={submitting} onClick={reserve}>{submitting ? 'Securing inventory…' : 'Reserve inventory'}</button><p className="cart-note">Pending reservations expire automatically after their hold window.</p></> : <p className="muted">Choose an available item to start a reservation.</p>}</aside>
    </div></>;
}

export function CustomerReservations() {
  const { session } = useAuth(); const [data, setData] = useState({ loading: true, error: null, reservations: [] }); const [actionId, setActionId] = useState(null); const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(async ({ silent = false } = {}) => { if (!silent) setData((current) => ({ ...current, loading: true, error: null })); try { const { payload } = await api.reservations(session.token); setData({ loading: false, error: null, reservations: payload.reservations }); } catch (error) { setData((current) => ({ ...current, loading: false, error })); } }, [session.token]);
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

  const transition = async (reservation, type) => { setActionId(reservation._id); try { await (type === 'complete' ? api.completeReservation(session.token, reservation._id) : api.cancelReservation(session.token, reservation._id)); await refresh(); } catch (error) { setData((current) => ({ ...current, error })); } finally { setActionId(null); } };
  if (data.loading) return <LoadingState label="Loading reservations" />; if (data.error && !data.reservations.length) return <ErrorState error={data.error} retry={refresh} />;
  return <><PageHeader eyebrow="Your activity" title="My reservations" detail="Complete a pending reservation before its hold window ends, or release it early." />{data.error && <div className="notice error">{data.error.message}</div>}
    {data.reservations.length ? <div className="reservation-list">{data.reservations.map((reservation) => {
      const overdue = reservation.status === 'pending' && new Date(reservation.expiresAt).getTime() <= now;
      return <article className="reservation-row" key={reservation._id}><div className="reservation-primary"><div className="reservation-title"><strong>Reservation #{reservation._id.slice(-6).toUpperCase()}</strong>{overdue ? <span className="status status-expired">Expiring</span> : <ReservationStatus status={reservation.status} />}</div><span>{reservation.items.map((item) => `${item.name} × ${item.quantity}`).join(' · ')}</span><small>Created {new Date(reservation.createdAt).toLocaleString()}{reservation.status === 'pending' && !overdue && ` · Expires in ${formatCountdown(new Date(reservation.expiresAt).getTime() - now)}`}{overdue && ' · Hold window ended — inventory is being released'}</small></div>{reservation.status === 'pending' && !overdue && <div className="row-actions"><button className="button button-secondary" disabled={actionId === reservation._id} onClick={() => transition(reservation, 'cancel')}>Release</button><button className="button button-primary" disabled={actionId === reservation._id} onClick={() => transition(reservation, 'complete')}>Complete</button></div>}</article>;
    })}</div> : <EmptyState title="No reservations yet" detail="Reservations you create from the catalog will appear here." />}</>;
}
