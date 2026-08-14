import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { ReservationCountProvider } from '../context/ReservationCountContext.jsx';
import { WishlistProvider } from '../context/WishlistContext.jsx';
import { api } from '../services/api.js';
import { AppShell } from './AppShell.jsx';

vi.mock('../services/api.js', async () => {
  const { apiMockFactory } = await import('../test/apiMock.js');
  return apiMockFactory();
});

const customerAuth = {
  session: { token: 't', user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } },
  loading: false,
  saveSession: vi.fn(),
  logout: vi.fn(),
};

function renderShell() {
  return render(
    <AuthContext.Provider value={customerAuth}>
      <MemoryRouter>
        <WishlistProvider>
          <ReservationCountProvider>
            <AppShell>
              <div>page content</div>
            </AppShell>
          </ReservationCountProvider>
        </WishlistProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.wishlist.mockResolvedValue({ payload: { items: [] } });
  api.reservations.mockResolvedValue({
    payload: { reservations: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 1 } },
  });
});
afterEach(cleanup);

describe('AppShell sign out', () => {
  it('opens a centered confirmation dialog and signs out on confirm', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveAttribute('data-tooltip', 'Sign out');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(customerAuth.logout).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
    expect(within(dialog).getByText(/sign in again/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));
    expect(customerAuth.logout).toHaveBeenCalledTimes(1);
  });

  it('cancels via the Cancel button without signing out', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(customerAuth.logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels via the Escape key', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(customerAuth.logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('AppShell sidebar badges', () => {
  it('shows live wishlist and pending reservation counts', async () => {
    api.wishlist.mockResolvedValue({ payload: { items: [{ product: { _id: 'p1' } }, { product: { _id: 'p2' } }] } });
    api.reservations.mockResolvedValue({
      payload: { reservations: [], pagination: { page: 1, limit: 1, total: 3, totalPages: 3 } },
    });
    renderShell();

    const wishlistLink = screen.getByRole('link', { name: /Wishlist/ });
    expect(await within(wishlistLink).findByText('2')).toBeInTheDocument();

    const reservationsLink = screen.getByRole('link', { name: /My reservations/ });
    expect(await within(reservationsLink).findByText('3')).toBeInTheDocument();

    // The count is read from a 1-item pending page's pagination total.
    expect(api.reservations).toHaveBeenCalledWith('t', { page: 1, limit: 1, status: 'pending' });
  });

  it('hides the badges when both counts are zero', async () => {
    api.wishlist.mockResolvedValue({ payload: { items: [] } });
    api.reservations.mockResolvedValue({
      payload: { reservations: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 1 } },
    });
    renderShell();

    await screen.findByRole('link', { name: /Wishlist/ });
    expect(screen.queryByText('0', { selector: '.nav-badge' })).not.toBeInTheDocument();
  });
});
