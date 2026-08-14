import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { api } from '../services/api.js';
import { AuthContext } from './AuthContext.jsx';
import { useWishlist, WishlistProvider } from './WishlistContext.jsx';

vi.mock('../services/api.js', async () => {
  const { apiMockFactory } = await import('../test/apiMock.js');
  return apiMockFactory();
});

const customerAuth = {
  session: { token: 'customer-token', user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } },
  loading: false, saveSession: vi.fn(), logout: vi.fn()
};

function Probe() {
  const { ids } = useWishlist();
  return <span>{ids.size} saved</span>;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('WishlistProvider', () => {
  it('refetches the membership set when the tab regains focus', async () => {
    api.wishlist.mockResolvedValueOnce({ payload: { items: [{ product: { _id: 'p1' } }] } });
    render(<AuthContext.Provider value={customerAuth}><WishlistProvider><Probe /></WishlistProvider></AuthContext.Provider>);
    await screen.findByText('1 saved');

    // Another tab removed the item; regaining focus should resync the set.
    api.wishlist.mockResolvedValueOnce({ payload: { items: [] } });
    window.dispatchEvent(new Event('focus'));

    await screen.findByText('0 saved');
  });
});
