const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

function query(params) {
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
  const string = search.toString();
  return string ? `?${string}` : '';
}

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
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(payload.error?.message ?? 'The request could not be completed', {
      status: response.status,
      code: payload.error?.code,
      details: payload.error?.details,
    });
  return { payload, response };
}

// Short-lived read coalescing: identical GETs issued within the same window share
// one request. React StrictMode double-mounts effects in development, and several
// components refetch on window focus at once; without this, duplicate reads stack
// up on the dev API and make interactions feel sluggish. Mutations never share.
const readCache = new Map();
const READ_TTL_MS = 2000;

function cachedGet(path, token) {
  const key = `${token ?? ''}|${path}`;
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.promise;
  const promise = request(path, { token }).finally(() => {
    if (readCache.get(key)?.promise === promise) readCache.delete(key);
  });
  readCache.set(key, { at: Date.now(), promise });
  return promise;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: (token) => cachedGet('/auth/me', token),
  products: (token, params = {}) => cachedGet(`/products${query(params)}`, token),
  reservations: (token, params = {}) => cachedGet(`/reservations${query(params)}`, token),
  createReservation: (token, items, idempotencyKey) =>
    request('/reservations', {
      token,
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ items }),
    }),
  cancelReservation: (token, id) => request(`/reservations/${id}/cancel`, { token, method: 'POST' }),
  completeReservation: (token, id) => request(`/reservations/${id}/complete`, { token, method: 'POST' }),
  adminProducts: (token, params = {}) => cachedGet(`/admin/products${query(params)}`, token),
  createProduct: (token, body) => request('/admin/products', { token, method: 'POST', body: JSON.stringify(body) }),
  updateProduct: (token, id, body) =>
    request(`/admin/products/${id}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  adminReservations: (token, params = {}) => cachedGet(`/admin/reservations${query(params)}`, token),
  adminUsers: (token, params = {}) => cachedGet(`/admin/users${query(params)}`, token),
  createUser: (token, body) => request('/admin/users', { token, method: 'POST', body: JSON.stringify(body) }),
  deactivateUser: (token, id) => request(`/admin/users/${id}`, { token, method: 'DELETE' }),
  reactivateUser: (token, id) => request(`/admin/users/${id}/activate`, { token, method: 'POST' }),
  wishlist: (token, params = {}) => cachedGet(`/wishlist${query(params)}`, token),
  addWishlistItem: (token, productId) =>
    request('/wishlist', { token, method: 'POST', body: JSON.stringify({ productId }) }),
  removeWishlistItem: (token, productId) => request(`/wishlist/${productId}`, { token, method: 'DELETE' }),
};
