import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { AppShell } from './AppShell.jsx';

const customerAuth = {
  session: { token: 't', user: { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer' } },
  loading: false, saveSession: vi.fn(), logout: vi.fn()
};

function renderShell() {
  return render(
    <AuthContext.Provider value={customerAuth}>
      <MemoryRouter><AppShell><div>page content</div></AppShell></MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('AppShell sign out', () => {
  it('opens a centered confirmation dialog and signs out on confirm', () => {
    renderShell();
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
