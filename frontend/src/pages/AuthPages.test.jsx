import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { ApiError, api } from '../services/api.js';
import { AuthPage } from './AuthPages.jsx';

vi.mock('../services/api.js', () => {
  class MockApiError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) { super(message); this.status = status; this.code = code; }
  }
  return {
    ApiError: MockApiError,
    api: { register: vi.fn(), login: vi.fn(), me: vi.fn(), products: vi.fn(), reservations: vi.fn(), createReservation: vi.fn(), cancelReservation: vi.fn(), completeReservation: vi.fn(), adminProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), adminReservations: vi.fn() }
  };
});

const anonymousAuth = { session: null, loading: false, saveSession: vi.fn(), logout: vi.fn() };

function renderAuthPage(mode) {
  return render(
    <AuthContext.Provider value={anonymousAuth}>
      <MemoryRouter><AuthPage mode={mode} /></MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('AuthPage login', () => {
  it('logs a customer in and stores the returned session', async () => {
    const session = { token: 't', user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } };
    api.login.mockResolvedValue({ payload: session });
    renderAuthPage('login');

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'jamie@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(anonymousAuth.saveSession).toHaveBeenCalledWith(session));
  });

  it('shows the server error when the credentials are wrong', async () => {
    api.login.mockRejectedValue(new ApiError('Email or password is incorrect', { status: 401, code: 'INVALID_CREDENTIALS' }));
    renderAuthPage('login');

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'jamie@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByRole('alert');
    expect(screen.getByText('Email or password is incorrect')).toBeInTheDocument();
  });
});

describe('AuthPage register', () => {
  it('registers a customer with name, email, and password', async () => {
    const session = { token: 't', user: { id: 'u2', name: 'New Customer', email: 'new@example.com', role: 'customer' } };
    api.register.mockResolvedValue({ payload: session });
    renderAuthPage('register');

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New Customer' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(api.register).toHaveBeenCalledWith({ name: 'New Customer', email: 'new@example.com', password: 'a-long-enough-password' }));
    await waitFor(() => expect(anonymousAuth.saveSession).toHaveBeenCalledWith(session));
  });

  it('surfaces a validation error from the API', async () => {
    api.register.mockRejectedValue(new ApiError('An account already exists for this email address', { status: 409, code: 'EMAIL_ALREADY_REGISTERED' }));
    renderAuthPage('register');

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New Customer' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'taken@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await screen.findByText('An account already exists for this email address');
  });
});
