import { vi } from 'vitest';

// Shared api mock factory for component tests: one consistent set of mocked
// methods instead of a duplicated factory in every test file.
export function apiMockFactory() {
  class MockApiError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) { super(message); this.status = status; this.code = code; }
  }
  return {
    ApiError: MockApiError,
    api: {
      register: vi.fn(), login: vi.fn(), me: vi.fn(),
      products: vi.fn(), reservations: vi.fn(), createReservation: vi.fn(),
      cancelReservation: vi.fn(), completeReservation: vi.fn(),
      adminProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(),
      adminReservations: vi.fn(), adminUsers: vi.fn(), createUser: vi.fn(),
      deactivateUser: vi.fn(), reactivateUser: vi.fn(),
      wishlist: vi.fn(), addWishlistItem: vi.fn(), removeWishlistItem: vi.fn()
    }
  };
}
