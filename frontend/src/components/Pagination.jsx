import ReactPaginate from 'react-paginate';

const PAGE_SIZES = [5, 10, 20, 50];

// Page-number pager for server-paginated lists, with a per-page size selector.
// Always rendered when the list has data, even on a single page, so the feature
// is visible and the totals are readable.
export function Pagination({ pagination, onChange, onLimitChange, label = 'items' }) {
  if (!pagination || !pagination.total) return null;
  return <nav className="pagination" aria-label="Pagination">
    <span className="pagination-info">{pagination.total} {label} · Page {pagination.page} of {pagination.totalPages}</span>
    <div className="pagination-controls">
      {onLimitChange && <label className="pagination-size">Per page
        <select aria-label="Items per page" value={pagination.limit} onChange={(event) => onLimitChange(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>}
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
  </nav>;
}
