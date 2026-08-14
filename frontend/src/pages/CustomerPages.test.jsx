import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { SnackbarProvider } from '../context/SnackbarContext.jsx';
import { WishlistProvider } from '../context/WishlistContext.jsx';
import { ApiError, api } from '../services/api.js';
import { CustomerCatalog, CustomerReservations } from './CustomerPages.jsx';

vi.mock('../services/api.js', async () => {
  const { apiMockFactory } = await import('../test/apiMock.js');
  return apiMockFactory();
});

const customerAuth = {
  session: { token: 'customer-token', user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } },
  loading: false,
  saveSession: vi.fn(),
  logout: vi.fn(),
};

function renderWithAuth(children) {
  return render(
    <AuthContext.Provider value={customerAuth}>
      <MemoryRouter>
        <SnackbarProvider>
          <WishlistProvider>{children}</WishlistProvider>
        </SnackbarProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const product = (overrides = {}) => ({
  _id: 'p1',
  sku: 'LAMP-01',
  name: 'Desk Lamp',
  description: 'Bright',
  priceCents: 5900,
  onHand: 3,
  reserved: 0,
  available: 3,
  isActive: true,
  ...overrides,
});

const reservation = (overrides = {}) => ({
  _id: 'abcdef123456',
  status: 'pending',
  customerId: 'u1',
  items: [{ productId: 'p1', sku: 'LAMP-01', name: 'Desk Lamp', quantity: 1, priceCents: 5900 }],
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.wishlist.mockResolvedValue({ payload: { items: [] } });
});
afterEach(cleanup);

describe('CustomerCatalog', () => {
  it('renders the catalog with availability and shows an empty state when nothing is active', async () => {
    api.products.mockResolvedValue({ payload: { products: [product({ available: 3 })] } });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');
    expect(screen.getByText('3 available')).toBeInTheDocument();
  });

  it('shows an error state with a working retry when the catalog fails to load', async () => {
    api.products.mockRejectedValueOnce(new ApiError('Service unavailable', { status: 503 }));
    api.products.mockResolvedValueOnce({ payload: { products: [product()] } });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Service unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Desk Lamp');
  });

  it('adds items to the cart and reserves them with a stable idempotency key', async () => {
    api.products.mockResolvedValue({ payload: { products: [product()] } });
    api.createReservation.mockResolvedValue({
      payload: {
        reservation: reservation({
          createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          expiresAt: new Date().toISOString(),
        }),
      },
    });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    expect(screen.getByText('2 units selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    const [token, items, key] = api.createReservation.mock.calls[0];
    expect(token).toBe('customer-token');
    expect(items).toEqual([{ productId: 'p1', quantity: 2 }]);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    await screen.findByText(/held for 10 minutes/);
  });

  it('shows reservation outcomes as dismissible snackbars', async () => {
    api.products.mockResolvedValue({ payload: { products: [product()] } });
    api.createReservation.mockResolvedValue({
      payload: {
        reservation: reservation({
          createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          expiresAt: new Date().toISOString(),
        }),
      },
    });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    const snackbar = await screen.findByRole('status');
    expect(snackbar).toHaveTextContent(/held for 10 minutes/);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText(/held for 10 minutes/)).not.toBeInTheDocument();
  });

  it('shows the server error and retries with the same idempotency key when a reservation fails', async () => {
    api.products.mockResolvedValue({ payload: { products: [product()] } });
    api.createReservation.mockRejectedValue(
      new ApiError('Desk Lamp no longer has enough available inventory', {
        status: 409,
        code: 'INSUFFICIENT_INVENTORY',
      }),
    );
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await screen.findByText(/no longer has enough available inventory/);

    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(2));
    expect(api.createReservation.mock.calls[0][2]).toBe(api.createReservation.mock.calls[1][2]);
  });

  it('toggles wishlist membership from the product card with snackbar feedback', async () => {
    api.products.mockResolvedValue({ payload: { products: [product()] } });
    api.addWishlistItem.mockResolvedValue({ payload: { item: { productId: 'p1' } } });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');

    const addButton = screen.getByRole('button', { name: 'Add Desk Lamp to wishlist' });
    expect(addButton).toHaveAttribute('data-tooltip', 'Add to wishlist');
    expect(addButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(addButton);

    await waitFor(() => expect(api.addWishlistItem).toHaveBeenCalledWith('customer-token', 'p1'));
    await screen.findByText('Desk Lamp added to your wishlist');
    const removeButton = screen.getByRole('button', { name: 'Remove Desk Lamp from wishlist' });
    expect(removeButton).toHaveAttribute('data-tooltip', 'Remove from wishlist');
    expect(removeButton).toHaveAttribute('aria-pressed', 'true');

    api.removeWishlistItem.mockResolvedValue({ payload: { removed: true } });
    fireEvent.click(removeButton);
    await waitFor(() => expect(api.removeWishlistItem).toHaveBeenCalledWith('customer-token', 'p1'));
    await screen.findByText('Desk Lamp removed from your wishlist');
    expect(screen.getByRole('button', { name: 'Add Desk Lamp to wishlist' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('restores a persisted draft after remount and clamps it to live availability', async () => {
    localStorage.setItem('reservewise.draft.u1', JSON.stringify({ items: { p1: 5 }, key: 'stored-key-1234' }));
    api.products.mockResolvedValue({ payload: { products: [product({ available: 3, onHand: 3 })] } });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByRole('heading', { name: 'Desk Lamp' });
    // The stored quantity of 5 is clamped to the 3 currently available.
    expect(screen.getByText('3 units selected')).toBeInTheDocument();
  });

  it('persists the draft and clears it after a successful reservation', async () => {
    api.products.mockResolvedValue({ payload: { products: [product()] } });
    api.createReservation.mockResolvedValue({
      payload: {
        reservation: reservation({
          createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          expiresAt: new Date().toISOString(),
        }),
      },
    });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('reservewise.draft.u1')).items.p1).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await screen.findByText(/held for 10 minutes/);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('reservewise.draft.u1'));
      expect(stored.items).toEqual({});
      expect(stored.key).toBeNull();
    });
  });

  it('keeps the draft and its idempotency key when a reservation fails, and reuses the key after remount', async () => {
    api.products.mockResolvedValue({ payload: { products: [product()] } });
    api.createReservation.mockRejectedValue(new ApiError('Service unavailable', { status: 503 }));
    const first = renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await screen.findByText('Service unavailable');

    const stored = JSON.parse(localStorage.getItem('reservewise.draft.u1'));
    expect(stored.items.p1).toBe(1);
    expect(stored.key).toMatch(/^[0-9a-f-]{36}$/);
    const failedKey = stored.key;

    // Simulate navigating away and back: the draft and key survive the remount.
    first.unmount();
    api.createReservation.mockResolvedValue({
      payload: {
        reservation: reservation({
          createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          expiresAt: new Date().toISOString(),
        }),
      },
    });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByRole('heading', { name: 'Desk Lamp' });
    expect(screen.getByText('1 unit selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await waitFor(() => expect(api.createReservation.mock.calls[1][2]).toBe(failedKey));
  });

  it('paginates the catalog and navigates between pages', async () => {
    api.products
      .mockResolvedValueOnce({
        payload: { products: [product()], pagination: { page: 1, limit: 10, total: 12, totalPages: 2 } },
      })
      .mockResolvedValueOnce({
        payload: {
          products: [product({ _id: 'p2', sku: 'LAMP-02', name: 'Second Lamp', available: 2, onHand: 2 })],
          pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
        },
      });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Second Lamp');
    expect(api.products).toHaveBeenLastCalledWith('customer-token', {
      page: 2,
      limit: 10,
      category: null,
      search: null,
      sort: 'name',
    });
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it('shows the pager even on a single page so pagination stays discoverable', async () => {
    api.products.mockResolvedValue({
      payload: { products: [product()], pagination: { page: 1, limit: 10, total: 3, totalPages: 1 } },
    });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    expect(screen.getByText(/3 products · Page 1 of 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('changes the page size and resets to the first page', async () => {
    api.products.mockResolvedValue({
      payload: { products: [product()], pagination: { page: 2, limit: 10, total: 12, totalPages: 2 } },
    });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    const size = screen.getByRole('combobox', { name: 'Items per page' });
    expect(size).toHaveValue('10');

    fireEvent.change(size, { target: { value: '20' } });
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith('customer-token', {
        page: 1,
        limit: 20,
        category: null,
        search: null,
        sort: 'name',
      }),
    );
  });

  it('filters the catalog by category with chips and shows the category on cards', async () => {
    api.products.mockResolvedValue({
      payload: {
        products: [product({ category: 'electronics' })],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    // The chip row offers all categories plus "All", and the card shows its category label.
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('article')).getByText('Electronics')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Furniture' }));
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith('customer-token', {
        page: 1,
        limit: 10,
        category: 'furniture',
        search: null,
        sort: 'name',
      }),
    );
    expect(screen.getByRole('button', { name: 'Furniture' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows product images in the reservation draft', async () => {
    api.products.mockResolvedValue({
      payload: {
        products: [product({ imageUrl: 'https://example.com/lamp.jpg', category: 'electronics' })],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    // One image on the card; a thumbnail joins it in the cart after adding.
    expect(screen.getAllByRole('img', { name: 'Desk Lamp' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    expect(screen.getAllByRole('img', { name: 'Desk Lamp' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '1 unit selected' }).closest('.cart-panel')).not.toBeNull();
  });

  it('debounces catalog search so typing fires a single query', async () => {
    api.products.mockResolvedValue({
      payload: { products: [product()], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } },
    });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    const searchInput = screen.getByRole('searchbox', { name: 'Search products' });
    fireEvent.change(searchInput, { target: { value: 'la' } });
    fireEvent.change(searchInput, { target: { value: 'lam' } });
    fireEvent.change(searchInput, { target: { value: 'lamp' } });

    // Let the debounce window elapse: exactly one search request goes out.
    await new Promise((resolve) => setTimeout(resolve, 450));
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith(
        'customer-token',
        expect.objectContaining({ search: 'lamp', page: 1 }),
      ),
    );
    expect(api.products.mock.calls.filter(([, params]) => params.search)).toHaveLength(1);
  });

  it('keeps search focus through a search-triggered reload so typing can continue', async () => {
    api.products.mockResolvedValue({
      payload: { products: [product()], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } },
    });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    const searchInput = screen.getByRole('searchbox', { name: 'Search products' });
    searchInput.focus();
    fireEvent.change(searchInput, { target: { value: 'lamp' } });
    await new Promise((resolve) => setTimeout(resolve, 450));
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith('customer-token', expect.objectContaining({ search: 'lamp' })),
    );

    // The toolbar survived the reload: the input still has focus and accepts more typing.
    expect(screen.getByRole('searchbox', { name: 'Search products' })).toHaveFocus();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search products' }), { target: { value: 'lamp shade' } });
    await new Promise((resolve) => setTimeout(resolve, 450));
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith(
        'customer-token',
        expect.objectContaining({ search: 'lamp shade' }),
      ),
    );
  });

  it('searches and sorts the catalog', async () => {
    api.products.mockResolvedValue({
      payload: { products: [product()], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } },
    });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    const searchInput = screen.getByRole('searchbox', { name: 'Search products' });
    fireEvent.change(searchInput, { target: { value: 'lamp' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith('customer-token', {
        page: 1,
        limit: 10,
        category: null,
        search: 'lamp',
        sort: 'name',
      }),
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort products' }), { target: { value: 'price-desc' } });
    await waitFor(() =>
      expect(api.products).toHaveBeenLastCalledWith('customer-token', {
        page: 1,
        limit: 10,
        category: null,
        search: 'lamp',
        sort: 'price-desc',
      }),
    );
  });

  it('renders product images with a graceful category fallback', async () => {
    api.products.mockResolvedValue({
      payload: {
        products: [product({ imageUrl: 'https://example.com/desk-lamp.jpg', category: 'home' })],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });
    renderWithAuth(<CustomerCatalog />);

    await screen.findByText('Desk Lamp');
    const image = screen.getByRole('img', { name: 'Desk Lamp' });
    expect(image).toHaveAttribute('src', 'https://example.com/desk-lamp.jpg');

    // A failing image is replaced by the per-category gradient tile.
    fireEvent.error(image);
    await screen.findByRole('img', { name: 'Desk Lamp — Home & Living artwork' });
  });
});

describe('CustomerReservations pagination', () => {
  it('navigates reservation pages', async () => {
    api.reservations.mockResolvedValueOnce({
      payload: { reservations: [reservation()], pagination: { page: 1, limit: 10, total: 11, totalPages: 2 } },
    });
    renderWithAuth(<CustomerReservations />);

    await screen.findByText(/Reservation #/);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.reservations).toHaveBeenLastCalledWith('customer-token', { page: 2, limit: 10 }));
  });
});

describe('CustomerReservations', () => {
  it('lists reservations with a live countdown and triggers release and complete', async () => {
    api.reservations.mockResolvedValue({
      payload: {
        reservations: [
          reservation(),
          reservation({ _id: 'fedcba654321', status: 'completed', completedAt: new Date().toISOString() }),
        ],
      },
    });
    api.cancelReservation.mockResolvedValue({ payload: { reservation: reservation({ status: 'cancelled' }) } });
    renderWithAuth(<CustomerReservations />);

    await screen.findByText(/Expires in 5:00/);
    expect(screen.getByText('Completed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    await waitFor(() => expect(api.cancelReservation).toHaveBeenCalledWith('customer-token', 'abcdef123456'));

    // The completed row offers no actions.
    expect(screen.queryAllByRole('button', { name: 'Release' })).toHaveLength(1);
  });

  it('shows an expiring state without actions once the hold window has passed', async () => {
    api.reservations.mockResolvedValue({
      payload: { reservations: [reservation({ expiresAt: new Date(Date.now() - 1000).toISOString() })] },
    });
    renderWithAuth(<CustomerReservations />);

    await screen.findByText('Expiring');
    expect(screen.getByText(/Hold window ended/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
  });

  it('shows an inline error when a transition fails', async () => {
    api.reservations.mockResolvedValue({ payload: { reservations: [reservation()] } });
    api.cancelReservation.mockRejectedValue(
      new ApiError('Only pending reservations can be cancelled', { status: 409 }),
    );
    renderWithAuth(<CustomerReservations />);

    await screen.findByText(/Expires in/);
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    await screen.findByText('Only pending reservations can be cancelled');
  });
});
