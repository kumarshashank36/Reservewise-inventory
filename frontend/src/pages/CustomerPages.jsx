import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState.jsx';
import { PageHeader } from '../components/AppShell.jsx';
import { ReservationStatus } from '../components/ReservationStatus.jsx';
import { api } from '../services/api.js';

const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function CustomerCatalog() {
  const { session } = useAuth();
  const [products, setProducts] = useState([]); const [cart, setCart] = useState({}); const [state, setState] = useState({ loading: true, error: null });
  const [submitting, setSubmitting] = useState(false); const [notice, setNotice] = useState(null); const idempotencyKey = useRef(null);
  const load = useCallback(async () => { setState({ loading: true, error: null }); try { const { payload } = await api.products(session.token); setProducts(payload.products); } catch (error) { setState({ loading: false, error }); return; } setState({ loading: false, error: null }); }, [session.token]);
  useEffect(() => { load(); }, [load]);
  const lines = useMemo(() => products.filter((product) => cart[product._id]).map((product) => ({ product, quantity: cart[product._id] })), [products, cart]);
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);
  const setQuantity = (product, quantity) => { setNotice(null); setCart((current) => { const next = { ...current }; if (quantity <= 0) delete next[product._id]; else next[product._id] = Math.min(quantity, product.available); return next; }); };
  const reserve = async () => { if (!lines.length) return; setSubmitting(true); setNotice(null); idempotencyKey.current ??= crypto.randomUUID(); try { await api.createReservation(session.token, lines.map(({ product, quantity }) => ({ productId: product._id, quantity })), idempotencyKey.current); setCart({}); idempotencyKey.current = null; setNotice({ kind: 'success', text: 'Your inventory is held for 10 minutes. Review it under My reservations.' }); await load(); } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setSubmitting(false); } };
  if (state.loading) return <LoadingState label="Loading catalog" />; if (state.error) return <ErrorState error={state.error} retry={load} />;
  return <><PageHeader eyebrow="Customer catalog" title="Available inventory" detail="Select quantities to place a ten-minute, protected hold." />
    {notice && <div className={`notice ${notice.kind}`} role="status">{notice.text}</div>}
    <div className="catalog-layout"><section className="product-grid">{products.length ? products.map((product) => <article className="product-card" key={product._id}><div className="product-card-top"><span className="sku">{product.sku}</span><span className={product.available ? 'stock-live' : 'stock-empty'}>{product.available ? `${product.available} available` : 'Unavailable'}</span></div><h2>{product.name}</h2><p>{product.description || 'No description provided.'}</p><div className="product-card-footer"><strong>{money(product.priceCents)}</strong><div className="stepper"><button disabled={!cart[product._id]} onClick={() => setQuantity(product, (cart[product._id] ?? 0) - 1)} aria-label={`Remove one ${product.name}`}>−</button><span>{cart[product._id] ?? 0}</span><button disabled={!product.available || (cart[product._id] ?? 0) >= product.available} onClick={() => setQuantity(product, (cart[product._id] ?? 0) + 1)} aria-label={`Add one ${product.name}`}>+</button></div></div></article>) : <EmptyState title="No inventory is available" detail="Check back when your operations team adds active products." />}</section>
      <aside className="cart-panel"><div><p className="eyebrow">Reservation draft</p><h2>{itemCount ? `${itemCount} unit${itemCount === 1 ? '' : 's'} selected` : 'Your selection is empty'}</h2></div>{lines.length ? <><div className="cart-lines">{lines.map(({ product, quantity }) => <div key={product._id}><span>{product.name} <small>× {quantity}</small></span><strong>{money(product.priceCents * quantity)}</strong></div>)}</div><button className="button button-primary form-submit" disabled={submitting} onClick={reserve}>{submitting ? 'Securing inventory…' : 'Reserve inventory'}</button><p className="cart-note">Pending reservations expire automatically after 10 minutes.</p></> : <p className="muted">Choose an available item to start a reservation.</p>}</aside>
    </div></>;
}

export function CustomerReservations() {
  const { session } = useAuth(); const [data, setData] = useState({ loading: true, error: null, reservations: [] }); const [actionId, setActionId] = useState(null);
  const load = useCallback(async () => { setData((current) => ({ ...current, loading: true, error: null })); try { const { payload } = await api.reservations(session.token); setData({ loading: false, error: null, reservations: payload.reservations }); } catch (error) { setData((current) => ({ ...current, loading: false, error })); } }, [session.token]);
  useEffect(() => { load(); }, [load]);
  const transition = async (reservation, type) => { setActionId(reservation._id); try { await (type === 'complete' ? api.completeReservation(session.token, reservation._id) : api.cancelReservation(session.token, reservation._id)); await load(); } catch (error) { setData((current) => ({ ...current, error })); } finally { setActionId(null); } };
  if (data.loading) return <LoadingState label="Loading reservations" />; if (data.error && !data.reservations.length) return <ErrorState error={data.error} retry={load} />;
  return <><PageHeader eyebrow="Your activity" title="My reservations" detail="Complete a pending reservation before its hold window ends, or release it early." />{data.error && <div className="notice error">{data.error.message}</div>}
    {data.reservations.length ? <div className="reservation-list">{data.reservations.map((reservation) => <article className="reservation-row" key={reservation._id}><div className="reservation-primary"><div className="reservation-title"><strong>Reservation #{reservation._id.slice(-6).toUpperCase()}</strong><ReservationStatus status={reservation.status} /></div><span>{reservation.items.map((item) => `${item.name} × ${item.quantity}`).join(' · ')}</span><small>Created {new Date(reservation.createdAt).toLocaleString()}{reservation.status === 'pending' && ` · Hold ends ${new Date(reservation.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</small></div>{reservation.status === 'pending' && <div className="row-actions"><button className="button button-secondary" disabled={actionId === reservation._id} onClick={() => transition(reservation, 'cancel')}>Release</button><button className="button button-primary" disabled={actionId === reservation._id} onClick={() => transition(reservation, 'complete')}>Complete</button></div>}</article>)}</div> : <EmptyState title="No reservations yet" detail="Reservations you create from the catalog will appear here." />}</>;
}
