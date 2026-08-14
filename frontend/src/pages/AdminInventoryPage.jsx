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
const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const blankProduct = { sku: '', name: '', description: '', priceCents: '', onHand: '', category: 'electronics', imageUrl: '' };
const blankUser = { name: '', email: '', password: '', role: 'admin' };

export function AdminInventory() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');
  const limit = Number(searchParams.get('limit') ?? String(PAGE_SIZE));
  const filterCategory = searchParams.get('category') ?? null;
  const activeParam = searchParams.get('active');
  const filterActive = activeParam === null ? null : activeParam === 'true';
  const search = searchParams.get('q') ?? null;
  // Stable default: rows keep their place across edits and activate/deactivate.
  const sort = searchParams.get('sort') ?? 'name';
  const { showSnackbar } = useSnackbar(); const [data, setData] = useState({ loading: true, error: null, products: [] }); const [pagination, setPagination] = useState(null); const [form, setForm] = useState(blankProduct); const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false); const [editing, setEditing] = useState(null);
  const setParam = (patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      return next;
    });
  };
  const [searchInput, setSearchInput] = useState(search ?? '');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 400);
  useEffect(() => { if (debouncedSearch === (search ?? '')) return; setParam({ q: debouncedSearch || null, page: null }); }, [debouncedSearch]);
  useEffect(() => { setSearchInput(search ?? ''); }, [search]);
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setData((current) => ({ ...current, loading: true, error: null }));
    try {
      const { payload } = await api.adminProducts(session.token, { page, limit, category: filterCategory, active: filterActive, search, sort });
      if (seq !== requestSeq.current) return;
      setData({ loading: false, error: null, products: payload.products });
      setPagination(payload.pagination ?? null);
      if (payload.pagination && payload.pagination.totalPages < page) setParam({ page: payload.pagination.totalPages === 1 ? null : payload.pagination.totalPages });
    } catch (error) { if (seq !== requestSeq.current) return; setData((current) => ({ ...current, loading: false, error })); }
  }, [session.token, page, limit, filterCategory, filterActive, search, sort]);
  useEffect(() => { load(); }, [load]);
  const applySearch = () => { setParam({ q: searchInput.trim() || null, page: null }); };
  const closeForm = () => { setOpen(false); setForm(blankProduct); setEditing(null); };
  const startEdit = (product) => { setEditing(product); setForm({ sku: product.sku, name: product.name, description: product.description ?? '', priceCents: String(product.priceCents), onHand: String(product.onHand), category: product.category === 'misc' ? 'electronics' : product.category, imageUrl: product.imageUrl ?? '' }); setData((current) => ({ ...current, error: null })); setOpen(true); };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setData((current) => ({ ...current, error: null }));
    const priceCents = Number(form.priceCents);
    const onHand = Number(form.onHand);
    if (!Number.isInteger(onHand) || onHand < 0) { setData((current) => ({ ...current, error: new Error('On-hand inventory must be a non-negative whole number.') })); setSaving(false); return; }
    if (editing && onHand < editing.reserved) { setData((current) => ({ ...current, error: new Error(`On-hand inventory cannot be reduced below currently reserved inventory (${editing.reserved}).`) })); setSaving(false); return; }
    try {
      if (editing) {
        await api.updateProduct(session.token, editing._id, { name: form.name, description: form.description, priceCents, onHand, category: form.category, imageUrl: form.imageUrl.trim() });
        showSnackbar({ kind: 'success', text: `${form.name} updated.` });
      } else {
        await api.createProduct(session.token, { ...form, priceCents, onHand, imageUrl: form.imageUrl.trim() || undefined });
        showSnackbar({ kind: 'success', text: `${form.name} added to the catalog.` });
      }
      closeForm();
      if (page === 1) await load(); else setParam({ page: null });
    } catch (error) { showSnackbar({ kind: 'error', text: error.message }); } finally { setSaving(false); }
  };
  const setActive = async (product) => { try { await api.updateProduct(session.token, product._id, { isActive: !product.isActive }); showSnackbar({ kind: 'success', text: `${product.name} is now ${product.isActive ? 'inactive' : 'active'}.` }); await load(); } catch (error) { showSnackbar({ kind: 'error', text: error.message }); } };
  if (data.error && !data.products.length) return <ErrorState error={data.error} retry={load} />;
  return <><PageHeader eyebrow="Operations control" title="Inventory" detail="On-hand stock can never be set below existing reservations." action={<button className="button button-primary" onClick={() => (open ? closeForm() : setOpen(true))}>{open ? 'Close' : 'Add product'}</button>} />{data.error && <div className="notice error">{data.error.message}</div>}
    <div className="toolbar"><input className="toolbar-input" type="search" placeholder="Search by name or SKU…" aria-label="Search products" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }} /><select className="toolbar-select" aria-label="Filter category" value={filterCategory ?? ''} onChange={(e) => setParam({ category: e.target.value || null, page: null })}><option value="">All categories</option>{CATEGORIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select><select className="toolbar-select" aria-label="Filter status" value={filterActive === null ? '' : String(filterActive)} onChange={(e) => setParam({ active: e.target.value || null, page: null })}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select><select className="toolbar-select" aria-label="Sort products" value={sort} onChange={(e) => setParam({ sort: e.target.value, page: null })}><option value="updatedAt-desc">Recently updated</option><option value="name">Name A–Z</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></div>
    {open && <form className="product-form" onSubmit={submit}><label>SKU<input required disabled={Boolean(editing)} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label><label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Price (cents)<input required min="0" type="number" value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: e.target.value })} /></label><label>On hand<input required min="0" type="number" value={form.onHand} onChange={(e) => setForm({ ...form, onHand: e.target.value })} /></label><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label>Image URL<input type="url" placeholder="https://…" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></label><label className="form-wide">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>{editing && <button type="button" className="button button-secondary" onClick={closeForm}>Cancel</button>}<button className="button button-primary" disabled={saving}>{saving ? (editing ? 'Saving…' : 'Adding…') : (editing ? 'Save changes' : 'Add product')}</button></form>}
    {data.loading && !data.products.length ? <LoadingState label="Loading inventory" /> : data.products.length ? <div className="inventory-table"><div className="table-head"><span>Product</span><span>Price</span><span>Available</span><span>Reserved</span><span>On hand</span><span>Status</span><span /></div>{data.products.map((product) => <div className="table-row" key={product._id}><div className="table-product"><ProductImage product={product} className="inventory-thumb" /><div><strong>{product.name}</strong><small>{product.sku}{categoryLabel(product.category) ? ` · ${categoryLabel(product.category)}` : ''}</small></div></div><strong>{money(product.priceCents)}</strong><strong>{product.available}</strong><span>{product.reserved}</span><span>{product.onHand}</span><span className={product.isActive ? 'stock-live' : 'stock-empty'}>{product.isActive ? 'Active' : 'Inactive'}</span><div className="table-actions"><button onClick={() => startEdit(product)}>Edit</button><button onClick={() => setActive(product)}>{product.isActive ? 'Deactivate' : 'Activate'}</button></div></div>)}</div> : <EmptyState title="No products yet" detail="Add your first product to make it available to customers." />}
    <Pagination pagination={pagination} onChange={(next) => setParam({ page: next === 1 ? null : next })} onLimitChange={(next) => setParam({ limit: next === PAGE_SIZE ? null : next, page: null })} label="products" /></>;
}

