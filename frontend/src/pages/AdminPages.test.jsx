import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext.jsx';
import { ApiError, api } from '../services/api.js';
import { AdminInventory, AdminReservations, AdminUsers } from './AdminPages.jsx';

vi.mock('../services/api.js', () => {
  class MockApiError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) { super(message); this.status = status; this.code = code; }
  }
  return {
    ApiError: MockApiError,
    api: { register: vi.fn(), login: vi.fn(), me: vi.fn(), products: vi.fn(), reservations: vi.fn(), createReservation: vi.fn(), cancelReservation: vi.fn(), completeReservation: vi.fn(), adminProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), adminReservations: vi.fn(), adminUsers: vi.fn(), createUser: vi.fn(), deactivateUser: vi.fn(), reactivateUser: vi.fn() }
  };
});

const adminAuth = {
  session: { token: 'admin-token', user: { id: 'a1', name: 'Inventory Admin', email: 'admin@example.com', role: 'admin' } },
  loading: false, saveSession: vi.fn(), logout: vi.fn()
};

function renderWithAuth(children) {
  return render(<AuthContext.Provider value={adminAuth}><MemoryRouter>{children}</MemoryRouter></AuthContext.Provider>);
}

const product = (overrides = {}) => ({ _id: 'p1', sku: 'LAMP-01', name: 'Desk Lamp', priceCents: 5900, onHand: 3, reserved: 0, available: 3, isActive: true, ...overrides });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('AdminInventory', () => {
  it('lists inventory with thumbnails and edits a product through the form', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product({ imageUrl: 'https://example.com/lamp.jpg', category: 'electronics' })] } });
    api.updateProduct.mockResolvedValue({ payload: { product: product({ name: 'Renamed Lamp', onHand: 2, available: 2 }) } });
    renderWithAuth(<AdminInventory />);
    await screen.findByText('Desk Lamp');
    expect(screen.getByRole('img', { name: 'Desk Lamp' })).toBeInTheDocument();
    expect(screen.getByText('$59.00')).toBeInTheDocument(); // price column

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toHaveValue('Desk Lamp');
    expect(screen.getByLabelText('SKU')).toBeDisabled(); // SKU is immutable
    fireEvent.change(nameInput, { target: { value: 'Renamed Lamp' } });
    fireEvent.change(screen.getByLabelText('On hand'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith('admin-token', 'p1', expect.objectContaining({ name: 'Renamed Lamp', onHand: 2, category: 'electronics', imageUrl: 'https://example.com/lamp.jpg' })));
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument());
  });

  it('rejects a stock value below currently reserved units when editing', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product({ onHand: 3, reserved: 2, available: 1, category: 'electronics' })] } });
    renderWithAuth(<AdminInventory />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('On hand'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText(/cannot be reduced below currently reserved inventory \(2\)/);
    expect(api.updateProduct).not.toHaveBeenCalled();
  });

  it('surfaces the server conflict when the API rejects a stock update', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product({ reserved: 2, available: 1, category: 'electronics' })] } });
    api.updateProduct.mockRejectedValue(new ApiError('On-hand inventory cannot be reduced below currently reserved inventory', { status: 409, code: 'INVENTORY_BELOW_RESERVED' }));
    renderWithAuth(<AdminInventory />);
    await screen.findByText('Desk Lamp');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('On hand'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

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
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'furniture' } });
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'https://example.com/new-item.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    await waitFor(() => expect(api.createProduct).toHaveBeenCalledWith('admin-token', expect.objectContaining({ sku: 'NEW-01', priceCents: 100, onHand: 4, category: 'furniture', imageUrl: 'https://example.com/new-item.jpg' })));

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

describe('AdminUsers', () => {
  it('lists team accounts and provisions a new administrator', async () => {
    api.adminUsers.mockResolvedValue({ payload: { users: [{ id: 'a1', name: 'Inventory Admin', email: 'admin@example.com', role: 'admin', createdAt: new Date().toISOString() }] } });
    api.createUser.mockResolvedValue({ payload: { user: { id: 'a2', name: 'Second Admin', email: 'second@example.com', role: 'admin' } } });
    renderWithAuth(<AdminUsers />);

    await screen.findByText('Inventory Admin');
    expect(screen.getByText('admin')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Second Admin' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'second@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));

    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith('admin-token', { name: 'Second Admin', email: 'second@example.com', password: 'a-long-enough-password', role: 'admin' }));
  });

  it('sends the selected role and surfaces provisioning errors', async () => {
    api.adminUsers.mockResolvedValue({ payload: { users: [] } });
    api.createUser.mockRejectedValue(new ApiError('An account already exists for this email address', { status: 409, code: 'EMAIL_ALREADY_REGISTERED' }));
    renderWithAuth(<AdminUsers />);

    await screen.findByText('No accounts yet');

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Duplicate' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'dup@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-password' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));

    await screen.findByText('An account already exists for this email address');
    expect(api.createUser).toHaveBeenCalledWith('admin-token', expect.objectContaining({ role: 'customer' }));
  });

  it('offers deactivation only for customers and confirms inline before deleting', async () => {
    api.adminUsers.mockResolvedValue({ payload: { users: [
      { id: 'u1', name: 'Jamie', email: 'jamie@example.com', role: 'customer', createdAt: new Date().toISOString(), deletedAt: null },
      { id: 'a1', name: 'Inventory Admin', email: 'admin@example.com', role: 'admin', createdAt: new Date().toISOString(), deletedAt: null }
    ] } });
    api.deactivateUser.mockResolvedValue({ payload: { user: { id: 'u1', deletedAt: new Date().toISOString() } } });
    renderWithAuth(<AdminUsers />);

    await screen.findByText('Jamie');
    // Only the customer row offers deactivation.
    expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.deactivateUser).toHaveBeenCalledWith('admin-token', 'u1'));
  });

  it('shows deactivated customers with a badge and a reactivate action', async () => {
    api.adminUsers.mockResolvedValue({ payload: { users: [
      { id: 'u2', name: 'Former Customer', email: 'former@example.com', role: 'customer', createdAt: new Date().toISOString(), deletedAt: new Date().toISOString() }
    ] } });
    api.reactivateUser.mockResolvedValue({ payload: { user: { id: 'u2', deletedAt: null } } });
    renderWithAuth(<AdminUsers />);

    await screen.findByText('Former Customer');
    expect(screen.getByText('deactivated')).toBeInTheDocument();
    expect(screen.getByText(/Deactivated/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(api.reactivateUser).toHaveBeenCalledWith('admin-token', 'u2'));
  });

  it('paginates the inventory list', async () => {
    api.adminProducts.mockResolvedValueOnce({ payload: { products: [product()], pagination: { page: 1, limit: 10, total: 12, totalPages: 2 } } });
    renderWithAuth(<AdminInventory />);

    await screen.findByText('Desk Lamp');
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.adminProducts).toHaveBeenLastCalledWith('admin-token', { page: 2, limit: 10, category: null, active: null, search: null, sort: 'updatedAt-desc' }));
  });

  it('changes the inventory page size and resets to the first page', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product()], pagination: { page: 2, limit: 10, total: 12, totalPages: 2 } } });
    renderWithAuth(<AdminInventory />);

    await screen.findByText('Desk Lamp');
    fireEvent.change(screen.getByRole('combobox', { name: 'Items per page' }), { target: { value: '5' } });
    await waitFor(() => expect(api.adminProducts).toHaveBeenLastCalledWith('admin-token', { page: 1, limit: 5, category: null, active: null, search: null, sort: 'updatedAt-desc' }));
  });

  it('filters and sorts the inventory toolbar', async () => {
    api.adminProducts.mockResolvedValue({ payload: { products: [product()], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } } });
    renderWithAuth(<AdminInventory />);

    await screen.findByText('Desk Lamp');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter category' }), { target: { value: 'furniture' } });
    await waitFor(() => expect(api.adminProducts).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ category: 'furniture', page: 1 })));

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter status' }), { target: { value: 'false' } });
    await waitFor(() => expect(api.adminProducts).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ active: false })));

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort products' }), { target: { value: 'price-asc' } });
    await waitFor(() => expect(api.adminProducts).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ sort: 'price-asc' })));
  });

  it('paginates the reservation audit', async () => {
    api.adminReservations.mockResolvedValueOnce({ payload: { reservations: [{ _id: 'abcdef123456', status: 'pending', customerId: { name: 'Jamie', email: 'jamie@example.com' }, items: [{ sku: 'LAMP-01', quantity: 2, name: 'Desk Lamp' }], createdAt: new Date().toISOString() }], pagination: { page: 1, limit: 10, total: 11, totalPages: 2 } } });
    renderWithAuth(<AdminReservations />);

    await screen.findByText(/Jamie/);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.adminReservations).toHaveBeenLastCalledWith('admin-token', { page: 2, limit: 10, status: null, search: null, sort: 'createdAt-desc' }));
  });

  it('filters the reservation audit by status and sort', async () => {
    api.adminReservations.mockResolvedValue({ payload: { reservations: [{ _id: 'abcdef123456', status: 'pending', customerId: { name: 'Jamie', email: 'jamie@example.com' }, items: [{ sku: 'LAMP-01', quantity: 2, name: 'Desk Lamp' }], createdAt: new Date().toISOString() }], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } } });
    renderWithAuth(<AdminReservations />);

    await screen.findByText(/Jamie/);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter status' }), { target: { value: 'pending' } });
    await waitFor(() => expect(api.adminReservations).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ status: 'pending' })));

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort reservations' }), { target: { value: 'createdAt-asc' } });
    await waitFor(() => expect(api.adminReservations).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ sort: 'createdAt-asc' })));
  });

  it('paginates the team list', async () => {
    api.adminUsers.mockResolvedValueOnce({ payload: { users: [{ id: 'a1', name: 'Inventory Admin', email: 'admin@example.com', role: 'admin', createdAt: new Date().toISOString(), deletedAt: null }], pagination: { page: 1, limit: 10, total: 12, totalPages: 2 } } });
    renderWithAuth(<AdminUsers />);

    await screen.findByText('Inventory Admin');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.adminUsers).toHaveBeenLastCalledWith('admin-token', { page: 2, limit: 10 }));
  });
});
