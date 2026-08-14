import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { ApiError, api } from '../services/api.js';
import { AuthPage } from './AuthPages.jsx';

vi.mock('../services/api.js', async () => {
  const { apiMockFactory } = await import('../test/apiMock.js');
  return apiMockFactory();
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
  it('signs a customer in with the Customer toggle selected by default', async () => {
    const session = { token: 't', user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } };
    api.login.mockResolvedValue({ payload: session });
    renderAuthPage('login');

    expect(screen.getByRole('radio', { name: 'Customer' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Admin' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'jamie@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ email: 'jamie@example.com', password: 'a-long-enough-password', role: 'customer' }));
    await waitFor(() => expect(anonymousAuth.saveSession).toHaveBeenCalledWith(session));
  });

  it('sends the Admin sign-in type when the toggle is switched', async () => {
    const session = { token: 't', user: { id: 'a1', name: 'Inventory Admin', email: 'admin@example.com', role: 'admin' } };
    api.login.mockResolvedValue({ payload: session });
    renderAuthPage('login');

    fireEvent.click(screen.getByRole('radio', { name: 'Admin' }));
    expect(screen.getByRole('radio', { name: 'Admin' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Customer' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'a-long-enough-password', role: 'admin' }));
    await waitFor(() => expect(anonymousAuth.saveSession).toHaveBeenCalledWith(session));
  });

  it('shows the role-mismatch error when the account does not match the selected toggle', async () => {
    api.login.mockRejectedValue(new ApiError('This is an admin account. Select the Admin sign-in type and try again.', { status: 403, code: 'ROLE_MISMATCH' }));
    renderAuthPage('login');

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByRole('alert');
    expect(screen.getByText('This is an admin account. Select the Admin sign-in type and try again.')).toBeInTheDocument();
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
