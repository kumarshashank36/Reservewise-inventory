import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { ApiError, api } from '../services/api.js';
import { AdminInventory, AdminReservations } from './AdminPages.jsx';

vi.mock('../services/api.js', () => {
  class MockApiError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) { super(message); this.status = status; this.code = code; }
  }
  return {
    ApiError: MockApiError,
    api: { register: vi.fn(), login: vi.fn(), me: vi.fn(), products: vi.fn(), reservations: vi.fn(), createReservation: vi.fn(), cancelReservation: vi.fn(), completeReservation: vi.fn(), adminProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), adminReservations: vi.fn() }
  };
});

const adminAuth = {
  session: { token: 'admin-token', user: { id: 'a1', name: 'Inventory Admin', email: 'admin@example.com', role: 'admin' } },
  loading: false, saveSession: vi.fn(), logout: vi.fn()
};

function renderWithAuth(children) {
  return render(<AuthContext.Provider value={adminAuth}>{children}</AuthContext.Provider>);
}

const product = (overrides = {}) => ({ _id: 'p1', sku: 'LAMP-01', name: 'Desk Lamp', priceCents: 5900, onHand: 3, reserved: 0, available: 3, isActive: true, ...overrides });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('AdminInventory', () => {
  it('lists inventory and updates on-hand stock inline', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product()] } });
    api.updateProduct.mockResolvedValue({ payload: { product: product({ onHand: 2, available: 2 }) } });
    renderWithAuth(<AdminInventory />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    const input = screen.getByRole('spinbutton', { name: 'On-hand quantity for Desk Lamp' });
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith('admin-token', 'p1', { onHand: 2 }));
    await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument());
  });

  it('rejects a stock value below currently reserved units with an inline error', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product({ onHand: 3, reserved: 2, available: 1 })] } });
    renderWithAuth(<AdminInventory />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'On-hand quantity for Desk Lamp' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText(/cannot be reduced below currently reserved inventory \(2\)/);
    expect(api.updateProduct).not.toHaveBeenCalled();
  });

  it('surfaces the server conflict when the API rejects a stock update', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product({ reserved: 2, available: 1 })] } });
    api.updateProduct.mockRejectedValue(new ApiError('On-hand inventory cannot be reduced below currently reserved inventory', { status: 409, code: 'INVENTORY_BELOW_RESERVED' }));
    renderWithAuth(<AdminInventory />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'On-hand quantity for Desk Lamp' }), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('On-hand inventory cannot be reduced below currently reserved inventory');
  });

  it('adds a product and toggles activation', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product()] } });
    api.createProduct.mockResolvedValue({ payload: { product: product({ sku: 'NEW-01' }) } });
    api.updateProduct.mockResolvedValue({ payload: { product: product({ isActive: false }) } });
    renderWithAuth(<AdminInventory />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'NEW-01' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Item' } });
    fireEvent.change(screen.getByLabelText('Price (cents)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('On hand'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    await waitFor(() => expect(api.createProduct).toHaveBeenCalledWith('admin-token', expect.objectContaining({ sku: 'NEW-01', priceCents: 100, onHand: 4 })));

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith('admin-token', 'p1', { isActive: false }));
  });
});

describe('AdminReservations', () => {
  it('renders the audit view with customer identity and item snapshots', async () => {
    api.adminReservations.mockResolvedValue({ payload: { reservations: [{ _id: 'abcdef123456', status: 'pending', customerId: { name: 'Jamie', email: 'jamie@example.com' }, items: [{ sku: 'LAMP-01', quantity: 2, name: 'Desk Lamp' }], createdAt: new Date().toISOString() }] } });
    renderWithAuth(<AdminReservations />);

    await screen.findByText(/Jamie/);
    expect(screen.getByText(/jamie@example.com/)).toBeInTheDocument();
    expect(screen.getByText('LAMP-01 × 2')).toBeInTheDocument();
  });
});
