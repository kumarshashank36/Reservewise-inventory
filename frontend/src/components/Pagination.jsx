import ReactPaginate from 'react-paginate';

const PAGE_SIZES = [5, 10, 20, 50];

// Page-number pager for server-paginated lists, with a per-page size selector.
// Always rendered when the list has data, even on a single page, so the feature
// is visible and the totals are readable.
export function Pagination({ pagination, onChange, onLimitChange, label = 'items' }) {
  if (!pagination || !pagination.total) return null;
  return (
    <nav
      className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-[#53536a]"
      aria-label="Pagination"
    >
      <span>
        {pagination.total} {label} · Page {pagination.page} of {pagination.totalPages}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {onLimitChange && (
          <label className="flex items-center gap-2 text-xs font-medium">
            Per page
            <select
              className="h-8 rounded-full border border-black/10 bg-white/65 px-3 text-xs outline-none focus:ring-2 focus:ring-[#1e40ff]/20"
              aria-label="Items per page"
              value={pagination.limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <ReactPaginate
          pageCount={pagination.totalPages}
          pageRangeDisplayed={2}
          marginPagesDisplayed={1}
          forcePage={pagination.page - 1}
          onPageChange={({ selected }) => onChange(selected + 1)}
          previousLabel="Previous"
          nextLabel="Next"
          breakLabel="…"
          containerClassName="paginate"
          pageClassName="paginate-page"
          pageLinkClassName="paginate-link"
          previousClassName="paginate-nav"
          previousLinkClassName="paginate-nav-link"
          nextClassName="paginate-nav"
          nextLinkClassName="paginate-nav-link"
          breakClassName="paginate-break"
          breakLinkClassName="paginate-break-link"
          disabledClassName="paginate-disabled"
          activeClassName="paginate-active"
          renderOnZeroPageCount={null}
        />
      </div>
    </nav>
  );
}
