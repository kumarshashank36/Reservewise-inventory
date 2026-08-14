import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState.jsx';
import { PageHeader } from '../components/AppShell.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { CATEGORIES, categoryLabel } from '../categories.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { heldMinutes, money } from '../format.js';
import { patchSearchParams } from '../url.js';
import { api } from '../services/api.js';

const PAGE_SIZE = 10;

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
  // List state lives in the URL query string: shareable, back/forward friendly,
  // and a single source of truth for the server request.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');
  const limit = Number(searchParams.get('limit') ?? String(PAGE_SIZE));
  const category = searchParams.get('category') ?? null;
  const search = searchParams.get('q') ?? null;
  const sort = searchParams.get('sort') ?? 'name';
  const [products, setProducts] = useState([]); const [pagination, setPagination] = useState(null); const [state, setState] = useState({ loading: true, error: null });
  // The draft (selections + the pending idempotency key) survives navigation and refreshes.
  const idempotencyKey = useRef(null);
  const [draft, setDraft] = useState(() => { const restored = readDraft(draftKey); if (restored) idempotencyKey.current = restored.key; return restored ?? emptyDraft(); });
  const [submitting, setSubmitting] = useState(false);
  const { showSnackbar } = useSnackbar();
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* storage unavailable */ } }, [draft, draftKey]);
  const setParam = (patch) => patchSearchParams(setSearchParams, patch);
  // Debounced live search: one request per pause in typing, applied as the ?q= param.
  const [searchInput, setSearchInput] = useState(search ?? '');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 400);
  useEffect(() => { if (debouncedSearch === (search ?? '')) return; setParam({ q: debouncedSearch || null, page: null }); }, [debouncedSearch]);
  useEffect(() => { setSearchInput(search ?? ''); }, [search]);
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setState({ loading: true, error: null });
    try {
      const { payload } = await api.products(session.token, { page, limit, category, search, sort });
      if (seq !== requestSeq.current) return; // superseded by a newer request
      setProducts(payload.products);
      setPagination(payload.pagination ?? null);
      if (payload.pagination && payload.pagination.totalPages < page) setParam({ page: payload.pagination.totalPages === 1 ? null : payload.pagination.totalPages });
      // Clamp the restored draft against this page: drop or cap lines whose product is
      // visible here; lines on other pages are left untouched.
      setDraft((current) => {
        const items = { ...current.items };
        let changed = false;
        for (const [id, quantity] of Object.entries(items)) {
          const product = payload.products.find((candidate) => candidate._id === id);
          if (!product) continue;
          if (product.available <= 0) { delete items[id]; changed = true; }
          else if (quantity > product.available) { items[id] = product.available; changed = true; }
        }
        if (changed) idempotencyKey.current = null;
        return changed ? { items, key: null } : current;
      });
    } catch (error) { if (seq !== requestSeq.current) return; setState({ loading: false, error }); return; }
    setState({ loading: false, error: null });
  }, [session.token, page, limit, category, search, sort]);
  useEffect(() => { load(); }, [load]);
  const selectCategory = (next) => { if (next === category) return; setParam({ category: next || null, page: null }); };
  const applySearch = () => { setParam({ q: searchInput.trim() || null, page: null }); };
  const lines = useMemo(() => products.filter((product) => draft.items[product._id]).map((product) => ({ product, quantity: draft.items[product._id] })), [products, draft.items]);
  const itemCount = Object.values(draft.items).reduce((total, quantity) => total + quantity, 0);
  const hiddenLineCount = Object.keys(draft.items).length - lines.length;
  const setQuantity = (product, quantity) => { idempotencyKey.current = null; setDraft((current) => { const items = { ...current.items }; if (quantity <= 0) delete items[product._id]; else items[product._id] = Math.min(quantity, product.available); return { items, key: null }; }); };
  const onWishlistToggle = async (product) => { try { await toggleWishlist(product._id); } catch (error) { showSnackbar({ kind: 'error', text: error.message }); } };
  const reserve = async () => {
    if (!itemCount) return;
    setSubmitting(true);
    // The key lives with the draft, so a retry after navigation still replays the
    // original reservation. The ref guards against double-submits in the same render.
    idempotencyKey.current ??= crypto.randomUUID();
    const key = idempotencyKey.current;
    if (!draft.key) setDraft((current) => ({ ...current, key }));
    try {
      const { payload } = await api.createReservation(session.token, Object.entries(draft.items).map(([productId, quantity]) => ({ productId, quantity })), key);
      idempotencyKey.current = null; setDraft(emptyDraft());
      const minutes = heldMinutes(payload.reservation);
      showSnackbar({ kind: 'success', text: `Your inventory is held for ${minutes} minute${minutes === 1 ? '' : 's'}. Review it under My reservations.` });
      await load();
    } catch (error) { showSnackbar({ kind: 'error', text: error.message }); } finally { setSubmitting(false); }
  };
  if (state.error && !products.length) return <ErrorState error={state.error} retry={load} />;
  return <><PageHeader eyebrow="Customer catalog" title="Available inventory" detail="Select quantities to place a ten-minute, protected hold." />
    {state.error && <div className="notice error">{state.error.message}</div>}

    <div className="catalog-layout"><div className="catalog-main"><div className="toolbar"><input className="toolbar-input" type="search" placeholder="Search products by name or SKU…" aria-label="Search products" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }} /><select className="toolbar-select" aria-label="Sort products" value={sort} onChange={(e) => setParam({ sort: e.target.value, page: null })}><option value="name">Name A–Z</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></div><div className="category-chips" role="group" aria-label="Product categories"><button type="button" aria-pressed={category === null} className={`category-chip${category === null ? ' selected' : ''}`} onClick={() => selectCategory(null)}>All</button>{CATEGORIES.map(({ value, label }) => <button key={value} type="button" aria-pressed={category === value} className={`category-chip${category === value ? ' selected' : ''}`} onClick={() => selectCategory(value)}>{label}</button>)}</div>{state.loading && !products.length ? <LoadingState label="Loading catalog" /> : <section className="product-grid">{products.length ? products.map((product) => <article className="product-card" key={product._id}><ProductImage product={product} /><div className="product-card-top"><span className="sku">{product.sku}</span><button className={`wishlist-button${wishlistIds.has(product._id) ? ' saved' : ''}`} aria-pressed={wishlistIds.has(product._id)} aria-label={`${wishlistIds.has(product._id) ? 'Remove' : 'Add'} ${product.name} ${wishlistIds.has(product._id) ? 'from' : 'to'} wishlist`} onClick={() => onWishlistToggle(product)}>{wishlistIds.has(product._id) ? '♥' : '♡'}</button><span className={product.available ? 'stock-live' : 'stock-empty'}>{product.available ? `${product.available} available` : 'Out of stock'}</span></div>{categoryLabel(product.category) && <p className="product-category">{categoryLabel(product.category)}</p>}<h2>{product.name}</h2><p>{product.description || 'No description provided.'}</p><div className="product-card-footer"><strong>{money(product.priceCents)}</strong><div className="stepper"><button disabled={!draft.items[product._id]} onClick={() => setQuantity(product, (draft.items[product._id] ?? 0) - 1)} aria-label={`Remove one ${product.name}`}>−</button><span>{draft.items[product._id] ?? 0}</span><button disabled={!product.available || (draft.items[product._id] ?? 0) >= product.available} onClick={() => setQuantity(product, (draft.items[product._id] ?? 0) + 1)} aria-label={`Add one ${product.name}`}>+</button></div></div></article>) : <EmptyState title={search ? 'No products match your search' : category ? `No products in ${categoryLabel(category)}` : 'No inventory is available'} detail="Check back when your operations team adds active products." />}</section>}<Pagination pagination={pagination} onChange={(next) => setParam({ page: next === 1 ? null : next })} onLimitChange={(next) => setParam({ limit: next === PAGE_SIZE ? null : next, page: null })} label="products" /></div>
      <aside className="cart-panel"><div><p className="eyebrow">Reservation draft</p><h2>{itemCount ? `${itemCount} unit${itemCount === 1 ? '' : 's'} selected` : 'Your selection is empty'}</h2></div>{itemCount ? <><div className="cart-lines">{lines.map(({ product, quantity }) => <div key={product._id}><ProductImage product={product} className="cart-thumb" /><span>{product.name} <small>× {quantity}</small></span><strong>{money(product.priceCents * quantity)}</strong></div>)}</div>{hiddenLineCount > 0 && <p className="cart-note">+{hiddenLineCount} more selection{hiddenLineCount === 1 ? '' : 's'} on other pages</p>}<button className="button button-primary form-submit" disabled={submitting} onClick={reserve}>{submitting ? 'Securing inventory…' : 'Reserve inventory'}</button><p className="cart-note">Pending reservations expire automatically after their hold window.</p></> : <p className="muted">Choose an available item to start a reservation.</p>}</aside>
    </div></>;
}

