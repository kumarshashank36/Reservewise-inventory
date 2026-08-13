import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { WishlistItem } from '../src/models/WishlistItem.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/database.js';

const app = createApp();
const password = 'correct-horse-battery-staple';

async function register(email) {
  const response = await request(app).post('/api/v1/auth/register').send({ name: 'Wishlist Customer', email, password });
  return response.body.token;
}

async function createProduct({ sku = 'WISH-01', name = 'Wishlisted Item', onHand = 5, priceCents = 9900 } = {}) {
  const adminToken = await register(`admin-${sku}@example.com`);
  await User.updateOne({ email: `admin-${sku}@example.com` }, { role: 'admin' });
  const admin = await request(app).post('/api/v1/auth/login').send({ email: `admin-${sku}@example.com`, password, role: 'admin' });
  const response = await request(app).post('/api/v1/admin/products').set('Authorization', `Bearer ${admin.body.token}`).send({ sku, name, onHand, priceCents });
  return response.body.product;
}

function addToWishlist(token, productId) {
  return request(app).post('/api/v1/wishlist').set('Authorization', `Bearer ${token}`).send({ productId });
}

describe('wishlist API', () => {
  beforeAll(startTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  it('adds a product to the wishlist and lists it with current availability', async () => {
    const product = await createProduct();
    const customer = await register('wisher@example.com');

    const added = await addToWishlist(customer, product._id);
    expect(added.status).toBe(201);

    const list = await request(app).get('/api/v1/wishlist').set('Authorization', `Bearer ${customer}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].product).toMatchObject({ _id: product._id, sku: 'WISH-01', available: 5 });
    expect(list.body.items[0].addedAt).toBeTruthy();
  });

  it('never duplicates a wishlisted product, even under concurrent double-adds', async () => {
    const product = await createProduct({ sku: 'WISH-DUPE', name: 'Duped Item' });
    const customer = await register('dupe@example.com');

    const [first, second] = await Promise.all([addToWishlist(customer, product._id), addToWishlist(customer, product._id)]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);

    const again = await addToWishlist(customer, product._id);
    expect(again.status).toBe(200);

    expect(await WishlistItem.countDocuments({})).toBe(1);
    const list = await request(app).get('/api/v1/wishlist').set('Authorization', `Bearer ${customer}`);
    expect(list.body.items).toHaveLength(1);
  });

  it('persists the wishlist across sessions and isolates customers', async () => {
    const product = await createProduct({ sku: 'WISH-PERSIST', name: 'Persistent Item' });
    const owner = await register('owner-wish@example.com');
    const stranger = await register('stranger-wish@example.com');
    await addToWishlist(owner, product._id);

    // A fresh session (new token) for the same account still sees the item.
    const relogin = await request(app).post('/api/v1/auth/login').send({ email: 'owner-wish@example.com', password, role: 'customer' });
    const list = await request(app).get('/api/v1/wishlist').set('Authorization', `Bearer ${relogin.body.token}`);
    expect(list.body.items).toHaveLength(1);

    // The other customer sees nothing and cannot remove the owner's item.
    const strangerList = await request(app).get('/api/v1/wishlist').set('Authorization', `Bearer ${stranger}`);
    expect(strangerList.body.items).toHaveLength(0);

    const foreignRemove = await request(app).delete(`/api/v1/wishlist/${product._id}`).set('Authorization', `Bearer ${stranger}`);
    expect(foreignRemove.status).toBe(200);
    expect(foreignRemove.body.removed).toBe(false);
    expect(await WishlistItem.countDocuments({})).toBe(1);
  });

  it('never changes inventory when items are added or removed', async () => {
    const product = await createProduct({ sku: 'WISH-STOCK', name: 'Untouched Item', onHand: 4 });
    const customer = await register('stock-wish@example.com');

    await addToWishlist(customer, product._id);
    let stored = await Product.findById(product._id);
    expect(stored.onHand).toBe(4);
    expect(stored.reserved).toBe(0);

    const removed = await request(app).delete(`/api/v1/wishlist/${product._id}`).set('Authorization', `Bearer ${customer}`);
    expect(removed.status).toBe(200);
    expect(removed.body.removed).toBe(true);

    stored = await Product.findById(product._id);
    expect(stored.onHand).toBe(4);
    expect(stored.reserved).toBe(0);
  });

  it('reserves directly from the wishlist through the normal reservation flow', async () => {
    const product = await createProduct({ sku: 'WISH-RESERVE', name: 'Reservable Item', onHand: 3 });
    const customer = await register('wish-reserve@example.com');
    await addToWishlist(customer, product._id);

    const reservation = await request(app).post('/api/v1/reservations')
      .set('Authorization', `Bearer ${customer}`)
      .set('Idempotency-Key', 'wishlist-reserve-key-001')
      .send({ items: [{ productId: product._id, quantity: 2 }] });
    expect(reservation.status).toBe(201);

    // Only the reservation touched inventory; the wishlist item remains and shows the hold.
    const stored = await Product.findById(product._id);
    expect(stored.reserved).toBe(2);
    const list = await request(app).get('/api/v1/wishlist').set('Authorization', `Bearer ${customer}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].product.available).toBe(1);
  });

  it('fails gracefully when the wishlisted product has no availability left', async () => {
    const product = await createProduct({ sku: 'WISH-EMPTY', name: 'Empty Item', onHand: 1 });
    const owner = await register('wish-empty@example.com');
    const hoarder = await register('hoarder@example.com');
    await addToWishlist(owner, product._id);

    await request(app).post('/api/v1/reservations')
      .set('Authorization', `Bearer ${hoarder}`)
      .set('Idempotency-Key', 'hoard-key-001')
      .send({ items: [{ productId: product._id, quantity: 1 }] })
      .expect(201);

    const reservation = await request(app).post('/api/v1/reservations')
      .set('Authorization', `Bearer ${owner}`)
      .set('Idempotency-Key', 'wishlist-empty-key-001')
      .send({ items: [{ productId: product._id, quantity: 1 }] });
    expect(reservation.status).toBe(409);
    expect(reservation.body.error.code).toBe('INSUFFICIENT_INVENTORY');

    // The wishlist item remains, showing zero availability.
    const list = await request(app).get('/api/v1/wishlist').set('Authorization', `Bearer ${owner}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].product.available).toBe(0);
  });

  it('removes a wishlist item idempotently without touching inventory', async () => {
    const product = await createProduct({ sku: 'WISH-REMOVE', name: 'Removable Item' });
    const customer = await register('wish-remove@example.com');
    await addToWishlist(customer, product._id);

    const removed = await request(app).delete(`/api/v1/wishlist/${product._id}`).set('Authorization', `Bearer ${customer}`);
    expect(removed.status).toBe(200);
    expect(removed.body.removed).toBe(true);

    const again = await request(app).delete(`/api/v1/wishlist/${product._id}`).set('Authorization', `Bearer ${customer}`);
    expect(again.status).toBe(200);
    expect(again.body.removed).toBe(false);

    expect(await WishlistItem.countDocuments({})).toBe(0);
    const stored = await Product.findById(product._id);
    expect(stored.onHand).toBe(5);
    expect(stored.reserved).toBe(0);
  });

  it('gates the wishlist to customers and validates identifiers', async () => {
    const product = await createProduct();
    const customer = await register('real-customer-wish@example.com');

    const promoted = await register('promoted-wish@example.com');
    await User.updateOne({ email: 'promoted-wish@example.com' }, { role: 'admin' });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({ email: 'promoted-wish@example.com', password, role: 'admin' });
    const adminToken = adminLogin.body.token;

    // Admins do not get wishlist functionality.
    await request(app).get('/api/v1/wishlist').set('Authorization', `Bearer ${adminToken}`).expect(403);
    await request(app).post('/api/v1/wishlist').set('Authorization', `Bearer ${adminToken}`).send({ productId: product._id }).expect(403);
    await request(app).delete(`/api/v1/wishlist/${product._id}`).set('Authorization', `Bearer ${adminToken}`).expect(403);

    const malformed = await request(app).post('/api/v1/wishlist').set('Authorization', `Bearer ${customer}`).send({ productId: 'not-an-id' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

    const missing = await request(app).post('/api/v1/wishlist').set('Authorization', `Bearer ${customer}`).send({ productId: '000000000000000000000000' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});
