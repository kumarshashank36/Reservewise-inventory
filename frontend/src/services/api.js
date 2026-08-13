const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { token, headers, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error?.message ?? 'The request could not be completed', { status: response.status, code: payload.error?.code, details: payload.error?.details });
  return { payload, response };
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: (token) => request('/auth/me', { token }),
  products: (token) => request('/products', { token }),
  reservations: (token) => request('/reservations', { token }),
  createReservation: (token, items, idempotencyKey) => request('/reservations', { token, method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ items }) }),
  cancelReservation: (token, id) => request(`/reservations/${id}/cancel`, { token, method: 'POST' }),
  completeReservation: (token, id) => request(`/reservations/${id}/complete`, { token, method: 'POST' }),
  adminProducts: (token) => request('/admin/products', { token }),
  createProduct: (token, body) => request('/admin/products', { token, method: 'POST', body: JSON.stringify(body) }),
  updateProduct: (token, id, body) => request(`/admin/products/${id}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  adminReservations: (token) => request('/admin/reservations', { token })
};
