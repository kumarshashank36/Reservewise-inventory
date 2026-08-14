import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { SnackbarProvider } from '../context/SnackbarContext.jsx';
import { WishlistProvider } from '../context/WishlistContext.jsx';
import { ApiError, api } from '../services/api.js';
import { CustomerWishlist } from './WishlistPage.jsx';

vi.mock('../services/api.js', async () => {
  const { apiMockFactory } = await import('../test/apiMock.js');
  return apiMockFactory();
});

const customerAuth = {
  session: { token: 'customer-token', user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } },
  loading: false, saveSession: vi.fn(), logout: vi.fn()
};

function renderWishlist() {
  return render(
    <AuthContext.Provider value={customerAuth}>
      <SnackbarProvider><WishlistProvider><CustomerWishlist /></WishlistProvider></SnackbarProvider>
    </AuthContext.Provider>
  );
}

const item = (overrides = {}) => ({
  product: { _id: 'p1', sku: 'LAMP-01', name: 'Desk Lamp', description: 'Bright', priceCents: 5900, isActive: true, onHand: 3, reserved: 0, available: 3 },
  addedAt: new Date().toISOString(),
  ...overrides
});

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('CustomerWishlist', () => {
  it('shows saved products with live availability and reserves through the normal flow', async () => {
    api.wishlist.mockResolvedValue({ payload: { items: [item()] } });
    api.createReservation.mockResolvedValue({ payload: { reservation: { createdAt: new Date(Date.now() - 10 * 60_000).toISOString(), expiresAt: new Date().toISOString() } } });
    renderWishlist();

    await screen.findByText('Desk Lamp');
    expect(screen.getByText('3 available')).toBeInTheDocument();

    // Locked until a quantity is picked.
    const reserveButton = screen.getByRole('button', { name: 'Reserve' });
    expect(reserveButton).toBeDisabled();
    expect(reserveButton).toHaveAttribute('data-tooltip', 'Add at least one to reserve');

    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    expect(screen.getByRole('button', { name: 'Reserve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reserve' })).not.toHaveAttribute('data-tooltip');
    fireEvent.click(screen.getByRole('button', { name: 'Reserve' }));

    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    const [token, items, key] = api.createReservation.mock.calls[0];
    expect(token).toBe('customer-token');
    expect(items).toEqual([{ productId: 'p1', quantity: 1 }]);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await screen.findByText(/held for 10 minutes/);
  });

  it('shows unavailable products without a reserve path and fails reservations gracefully', async () => {
    api.wishlist.mockResolvedValue({ payload: { items: [item({ product: { ...item().product, available: 0 } })] } });
    renderWishlist();

    await screen.findByText('Out of stock');
    expect(screen.getByRole('button', { name: 'Add one Desk Lamp' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reserve' })).toBeDisabled();
  });

  it('shows the server availability message when a reserve fails', async () => {
    api.wishlist.mockResolvedValue({ payload: { items: [item()] } });
    api.createReservation.mockRejectedValue(new ApiError('Desk Lamp no longer has enough available inventory', { status: 409, code: 'INSUFFICIENT_INVENTORY' }));
    renderWishlist();

    await screen.findByText('Desk Lamp');
    fireEvent.click(screen.getByRole('button', { name: 'Add one Desk Lamp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reserve' }));

    await screen.findByText('Desk Lamp no longer has enough available inventory');
  });

  it('removes items from the wishlist without touching reservations', async () => {
    api.wishlist.mockResolvedValue({ payload: { items: [item()] } });
    api.removeWishlistItem.mockResolvedValue({ payload: { removed: true } });
    renderWishlist();

    await screen.findByText('Desk Lamp');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Desk Lamp from wishlist' }));

    await waitFor(() => expect(api.removeWishlistItem).toHaveBeenCalledWith('customer-token', 'p1'));
    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it('shows an empty state when nothing is saved', async () => {
    api.wishlist.mockResolvedValue({ payload: { items: [] } });
    renderWishlist();

    await screen.findByText('Nothing saved yet');
  });

  it('re-syncs when membership changes elsewhere and the first fetch raced an in-flight add', async () => {
    // The page's mount fetch loses the race against a heart made in the catalog (empty),
    // the shared provider already knows the product, so the page must re-sync.
    api.wishlist
      .mockResolvedValueOnce({ payload: { items: [] } })
      .mockResolvedValueOnce({ payload: { items: [item()] } })
      .mockResolvedValue({ payload: { items: [item()] } });
    renderWishlist();

    await screen.findByText('Desk Lamp');
    expect(screen.getByText('3 available')).toBeInTheDocument();
  });

  it('paginates the wishlist', async () => {
    api.wishlist
      .mockResolvedValueOnce({ payload: { items: [item()], pagination: { page: 1, limit: 10, total: 12, totalPages: 2 } } })
      .mockResolvedValue({ payload: { items: [item()], pagination: { page: 1, limit: 10, total: 12, totalPages: 2 } } });
    renderWishlist();

    await screen.findByText('Desk Lamp');
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.wishlist).toHaveBeenLastCalledWith('customer-token', { page: 2, limit: 10 }));
  });
});
