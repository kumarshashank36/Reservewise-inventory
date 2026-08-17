import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState.jsx';
import { PageHeader } from '../components/AppShell.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { ReservationStatus } from '../components/ReservationStatus.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { usePatchSearchParams } from '../url.js';
import { api } from '../services/api.js';

const PAGE_SIZE = 10;

export function AdminReservations() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');
  const limit = Number(searchParams.get('limit') ?? String(PAGE_SIZE));
  const status = searchParams.get('status') ?? null;
  const search = searchParams.get('q') ?? null;
  const sort = searchParams.get('sort') ?? 'createdAt-desc';
  const [data, setData] = useState({ loading: true, error: null, reservations: [] });
  const [pagination, setPagination] = useState(null);
  const setParam = usePatchSearchParams(setSearchParams);
  const [searchInput, setSearchInput] = useState(search ?? '');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 400);
  useEffect(() => {
    if (debouncedSearch === (search ?? '')) return;
    setParam({ q: debouncedSearch || null, page: null });
    // `search` is deliberately omitted: reacting to it would re-apply the
    // debounced value and break back/forward navigation through filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, setParam]);
  useEffect(() => {
    setSearchInput(search ?? '');
  }, [search]);
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setData((current) => ({ ...current, loading: true, error: null }));
    try {
      const { payload } = await api.adminReservations(session.token, { page, limit, status, search, sort });
      if (seq !== requestSeq.current) return;
      setData({ loading: false, error: null, reservations: payload.reservations });
      setPagination(payload.pagination ?? null);
      if (payload.pagination && payload.pagination.totalPages < page)
        setParam({ page: payload.pagination.totalPages === 1 ? null : payload.pagination.totalPages });
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setData((current) => ({ ...current, loading: false, error }));
    }
  }, [session.token, page, limit, status, search, sort, setParam]);
  useEffect(() => {
    load();
  }, [load]);
  const applySearch = () => {
    setParam({ q: searchInput.trim() || null, page: null });
  };
  if (data.error && !data.reservations.length) return <ErrorState error={data.error} retry={load} />;
  return (
    <>
      <PageHeader
        eyebrow="Operations control"
        title="Reservation activity"
        detail="An audit view of every customer inventory hold and final state."
      />
      <div className="toolbar">
        <input
          className="toolbar-input"
          type="search"
          placeholder="Search by SKU or item name…"
          aria-label="Search reservations"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applySearch();
          }}
        />
        <select
          className="toolbar-select"
          aria-label="Filter status"
          value={status ?? ''}
          onChange={(e) => setParam({ status: e.target.value || null, page: null })}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </select>
        <select
          className="toolbar-select"
          aria-label="Sort reservations"
          value={sort}
          onChange={(e) => setParam({ sort: e.target.value, page: null })}
        >
          <option value="createdAt-desc">Newest first</option>
          <option value="createdAt-asc">Oldest first</option>
        </select>
      </div>
      {data.loading && !data.reservations.length ? (
        <LoadingState label="Loading reservation activity" />
      ) : data.reservations.length ? (
        <div className="reservation-list">
          {data.reservations.map((reservation) => (
            <article className="reservation-row" key={reservation._id}>
              <div className="reservation-primary">
                <div className="reservation-title">
                  <strong>
                    {reservation.customerId?.name ?? 'Deleted account'} <small>· {reservation.customerId?.email}</small>
                  </strong>
                  <ReservationStatus status={reservation.status} />
                </div>
                <div className="reservation-items">
                  {reservation.items.map((item) => (
                    <span className="reservation-item" key={item.productId ?? item.sku}>
                      <ProductImage product={item} className="reservation-thumb" size={240} />
                      {item.sku}
                      <small> × {item.quantity}</small>
                    </span>
                  ))}
                </div>
                <small>
                  #{reservation._id.slice(-6).toUpperCase()} · {new Date(reservation.createdAt).toLocaleString()}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No reservations recorded"
          detail="Customer activity will appear here once inventory is held."
        />
      )}
      <Pagination
        pagination={pagination}
        onChange={(next) => setParam({ page: next === 1 ? null : next })}
        onLimitChange={(next) => setParam({ limit: next === PAGE_SIZE ? null : next, page: null })}
        label="reservations"
      />
    </>
  );
}
