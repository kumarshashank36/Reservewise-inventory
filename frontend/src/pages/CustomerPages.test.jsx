import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { WishlistProvider } from '../context/WishlistContext.jsx';
import { ApiError, api } from '../services/api.js';
import { CustomerCatalog, CustomerReservations } from './CustomerPages.jsx';

vi.mock('../services/api.js', () => {
  class MockApiError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) { super(message); this.status = status; this.code = code; }
  }
  return {
    ApiError: MockApiError,
    api: { register: vi.fn(), login: vi.fn(), me: vi.fn(), products: vi.fn(), reservations: vi.fn(), createReservation: vi.fn(), cancelReservation: vi.fn(), completeReservation: vi.fn(), adminProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), adminReservations: vi.fn(), adminUsers: vi.fn(), createUser: vi.fn(), deactivateUser: vi.fn(), reactivateUser: vi.fn(), wishlist: vi.fn(), addWishlistItem: vi.fn(), removeWishlistItem: vi.fn() }
  };
});

const customerAuth = {
  session: { token: 'customer-token', user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } },
  loading: false, saveSession: vi.fn(), logout: vi.fn()
};

function renderWithAuth(children) {
  return render(<AuthContext.Provider value={customerAuth}><WishlistProvider>{children}</WishlistProvider></AuthContext.Provider>);
}

const product = (overrides = {}) => ({ _id: 'p1', sku: 'LAMP-01', name: 'Desk Lamp', description: 'Bright', priceCents: 5900, onHand: 3, reserved: 0, available: 3, isActive: true, ...overrides });

const reservation = (overrides = {}) => ({
  _id: 'abcdef123456', status: 'pending', customerId: 'u1',
  items: [{ productId: 'p1', sku: 'LAMP-01', name: 'Desk Lamp', quantity: 1, priceCents: 5900 }],
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  ...overrides
});

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); api.wishlist.mockResolvedValue({ payload: { items: [] } }); });
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
    api.createReservation.mockResolvedValue({ payload: { reservation: reservation({ createdAt: new Date(Date.now() - 10 * 60_000).toISOString(), expiresAt: new Date().toISOString() }) } });
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

  it('shows the server error and retries with the same idempotency key when a reservation fails', async () => {
    api.products.mockResolvedValue({ payload: { products: [product()] } });
    api.createReservation.mockRejectedValue(new ApiError('Desk Lamp no longer has enough available inventory', { status: 409, code: 'INSUFFICIENT_INVENTORY' }));
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await screen.findByText(/no longer has enough available inventory/);

    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(2));
    expect(api.createReservation.mock.calls[0][2]).toBe(api.createReservation.mock.calls[1][2]);
  });

  it('toggles wishlist membership from the product card', async () => {
    api.products.mockResolvedValue({ payload: { products: [product()] } });
    api.addWishlistItem.mockResolvedValue({ payload: { item: { productId: 'p1' } } });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByText('Desk Lamp');

    const addButton = screen.getByRole('button', { name: 'Add Desk Lamp to wishlist' });
    expect(addButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(addButton);

    await waitFor(() => expect(api.addWishlistItem).toHaveBeenCalledWith('customer-token', 'p1'));
    const removeButton = screen.getByRole('button', { name: 'Remove Desk Lamp from wishlist' });
    expect(removeButton).toHaveAttribute('aria-pressed', 'true');

    api.removeWishlistItem.mockResolvedValue({ payload: { removed: true } });
    fireEvent.click(removeButton);
    await waitFor(() => expect(api.removeWishlistItem).toHaveBeenCalledWith('customer-token', 'p1'));
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
    api.createReservation.mockResolvedValue({ payload: { reservation: reservation({ createdAt: new Date(Date.now() - 10 * 60_000).toISOString(), expiresAt: new Date().toISOString() }) } });
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
    api.createReservation.mockResolvedValue({ payload: { reservation: reservation({ createdAt: new Date(Date.now() - 10 * 60_000).toISOString(), expiresAt: new Date().toISOString() }) } });
    renderWithAuth(<CustomerCatalog />);
    await screen.findByRole('heading', { name: 'Desk Lamp' });
    expect(screen.getByText('1 unit selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reserve inventory' }));
    await waitFor(() => expect(api.createReservation.mock.calls[1][2]).toBe(failedKey));
  });
});

describe('CustomerReservations', () => {
  it('lists reservations with a live countdown and triggers release and complete', async () => {
    api.reservations.mockResolvedValue({ payload: { reservations: [reservation(), reservation({ _id: 'fedcba654321', status: 'completed', completedAt: new Date().toISOString() })] } });
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
    api.reservations.mockResolvedValue({ payload: { reservations: [reservation({ expiresAt: new Date(Date.now() - 1000).toISOString() })] } });
    renderWithAuth(<CustomerReservations />);

    await screen.findByText('Expiring');
    expect(screen.getByText(/Hold window ended/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
  });

  it('shows an inline error when a transition fails', async () => {
    api.reservations.mockResolvedValue({ payload: { reservations: [reservation()] } });
    api.cancelReservation.mockRejectedValue(new ApiError('Only pending reservations can be cancelled', { status: 409 }));
    renderWithAuth(<CustomerReservations />);

    await screen.findByText(/Expires in/);
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    await screen.findByText('Only pending reservations can be cancelled');
  });
});
