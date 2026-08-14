import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../services/api.js';
import { AuthProvider, useAuth } from './AuthContext.jsx';

vi.mock('../services/api.js', () => {
  class MockApiError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) { super(message); this.status = status; this.code = code; }
  }
  return {
    ApiError: MockApiError,
    api: { register: vi.fn(), login: vi.fn(), me: vi.fn(), products: vi.fn(), reservations: vi.fn(), createReservation: vi.fn(), cancelReservation: vi.fn(), completeReservation: vi.fn(), adminProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), adminReservations: vi.fn() }
  };
});

function Probe() {
  const { session, loading } = useAuth();
  return <span>{loading ? 'restoring' : (session ? session.user.name : 'signed-out')}</span>;
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { localStorage.clear(); cleanup(); });

describe('AuthProvider', () => {
  it('restores a stored session by revalidating the token with /auth/me', async () => {
    localStorage.setItem('reservewise.session', JSON.stringify({ token: 'stored-token', user: null }));
    api.me.mockResolvedValue({ payload: { user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } } });

    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByText('Jamie')).toBeInTheDocument();
    expect(api.me).toHaveBeenCalledWith('stored-token');
    expect(JSON.parse(localStorage.getItem('reservewise.session')).user.name).toBe('Jamie');
  });

  it('clears the stored session when the token is no longer valid', async () => {
    localStorage.setItem('reservewise.session', JSON.stringify({ token: 'stale-token', user: null }));
    api.me.mockRejectedValue(new ApiError('The authentication token is invalid or expired', { status: 401 }));

    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(localStorage.getItem('reservewise.session')).toBeNull();
  });

  it('revalidates the session when the tab regains focus', async () => {
    localStorage.setItem('reservewise.session', JSON.stringify({ token: 'stored-token', user: { id: 'u1', name: 'Jamie', role: 'customer' } }));
    api.me.mockResolvedValueOnce({ payload: { user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('Jamie');

    api.me.mockResolvedValueOnce({ payload: { user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'admin' } } });
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(api.me).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('reservewise.session')).user.role).toBe('admin'));
  });

  it('clears the reservation draft on logout', async () => {
    localStorage.setItem('reservewise.session', JSON.stringify({ token: 'stored-token', user: { id: 'u1', name: 'Jamie', role: 'customer' } }));
    localStorage.setItem('reservewise.draft.u1', JSON.stringify({ items: { p1: 2 }, key: null }));
    api.me.mockResolvedValue({ payload: { user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } } });

    function LogoutProbe() {
      const { logout } = useAuth();
      return <button onClick={logout}>logout</button>;
    }
    render(<AuthProvider><LogoutProbe /></AuthProvider>);

    fireEvent.click(await screen.findByRole('button', { name: 'logout' }));
    expect(localStorage.getItem('reservewise.session')).toBeNull();
    expect(localStorage.getItem('reservewise.draft.u1')).toBeNull();
  });
});
