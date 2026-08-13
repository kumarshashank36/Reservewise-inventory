import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Product } from '../src/models/Product.js';
import { Reservation } from '../src/models/Reservation.js';
import { User } from '../src/models/User.js';
import { WishlistItem } from '../src/models/WishlistItem.js';
import { startTestDatabase, stopTestDatabase } from './helpers/database.js';

const app = createApp();
const password = 'correct-horse-battery-staple';

async function register(email) {
  const response = await request(app).post('/api/v1/auth/register').send({ name: 'Paged Customer', email, password });
  return response.body.token;
}

let adminToken;
let customerToken;
let customerId;

function seedProducts(count) {
  return Product.insertMany(Array.from({ length: count }, (_, index) => ({
    sku: `PAG-${String(index).padStart(3, '0')}`,
    name: `Paged Item ${String(index).padStart(3, '0')}`,
    priceCents: 100 + index,
    onHand: 10,
    reserved: 0,
    isActive: true
  })));
}

beforeAll(async () => {
  await startTestDatabase();
  await register('pagination-admin@example.com');
  await User.updateOne({ email: 'pagination-admin@example.com' }, { role: 'admin' });
  const login = await request(app).post('/api/v1/auth/login').send({ email: 'pagination-admin@example.com', password, role: 'admin' });
  adminToken = login.body.token;
  customerToken = await register('pagination-customer@example.com');
  const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${customerToken}`);
  customerId = me.body.user.id;
});

// The seeded admin/customer tokens must stay valid across tests, so only fixture
// collections and bulk users are wiped between tests.
afterEach(async () => {
  await Promise.all([
    Product.deleteMany({}), Reservation.deleteMany({}), WishlistItem.deleteMany({}),
    User.deleteMany({ email: /^bulk-/ })
  ]);
});
afterAll(stopTestDatabase);

describe('list endpoint pagination', () => {
  it('paginates the customer catalog with metadata', async () => {
    await seedProducts(25);

    const response = await request(app).get('/api/v1/products?page=2&limit=10').set('Authorization', `Bearer ${customerToken}`);
    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(10);
    expect(response.body.products[0].name).toBe('Paged Item 010');
    expect(response.body.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
  });

  it('paginates the admin product and team lists', async () => {
    await seedProducts(25);
    await User.insertMany(Array.from({ length: 25 }, (_, index) => ({
      name: `Bulk User ${index}`, email: `bulk-${index}@example.com`, passwordHash: 'unused', role: 'customer'
    })));

    const products = await request(app).get('/api/v1/admin/products?page=3&limit=10').set('Authorization', `Bearer ${adminToken}`);
    expect(products.status).toBe(200);
    expect(products.body.products).toHaveLength(5);
    expect(products.body.pagination).toEqual({ page: 3, limit: 10, total: 25, totalPages: 3 });

    const users = await request(app).get('/api/v1/admin/users?page=2&limit=10').set('Authorization', `Bearer ${adminToken}`);
    expect(users.status).toBe(200);
    expect(users.body.users).toHaveLength(10);
    expect(users.body.pagination.total).toBe(27); // 25 bulk users + pagination-admin + pagination-customer
    expect(users.body.pagination.totalPages).toBe(3);
    expect(users.body.users.every((user) => user.passwordHash === undefined)).toBe(true);
  });

  it('paginates the customer and admin reservation lists', async () => {
    const product = await Product.create({ sku: 'PAG-PROD', name: 'Paged Product', priceCents: 100, onHand: 100, reserved: 0 });
    const now = new Date();
    await Reservation.insertMany(Array.from({ length: 25 }, (_, index) => ({
      customerId,
      status: 'pending',
      items: [{ productId: product._id, sku: 'PAG-PROD', name: 'Paged Product', quantity: 1, priceCents: 100 }],
      idempotencyKey: `pagination-key-${index}`,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000)
    })));

    const mine = await request(app).get('/api/v1/reservations?page=2&limit=10').set('Authorization', `Bearer ${customerToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.reservations).toHaveLength(10);
    expect(mine.body.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });

    const admin = await request(app).get('/api/v1/admin/reservations?limit=10').set('Authorization', `Bearer ${adminToken}`);
    expect(admin.status).toBe(200);
    expect(admin.body.reservations).toHaveLength(10);
    expect(admin.body.pagination.total).toBe(25);
    expect(admin.body.reservations[0].customerId.name).toBe('Paged Customer');
  });

  it('paginates the customer wishlist', async () => {
    const products = await seedProducts(25);
    await WishlistItem.insertMany(products.map((product) => ({ customerId, productId: product._id })));

    const response = await request(app).get('/api/v1/wishlist?page=2&limit=10').set('Authorization', `Bearer ${customerToken}`);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(10);
    expect(response.body.items.every((entry) => typeof entry.product.available === 'number')).toBe(true);
    expect(response.body.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
  });

  it('validates pagination query parameters', async () => {
    const zeroPage = await request(app).get('/api/v1/products?page=0').set('Authorization', `Bearer ${customerToken}`);
    expect(zeroPage.status).toBe(400);
    expect(zeroPage.body.error.code).toBe('VALIDATION_ERROR');

    const hugeLimit = await request(app).get('/api/v1/products?limit=101').set('Authorization', `Bearer ${customerToken}`);
    expect(hugeLimit.status).toBe(400);
    expect(hugeLimit.body.error.code).toBe('VALIDATION_ERROR');

    const garbage = await request(app).get('/api/v1/products?page=abc').set('Authorization', `Bearer ${customerToken}`);
    expect(garbage.status).toBe(400);
    expect(garbage.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('filters the customer catalog by category and rejects unknown categories', async () => {
    await Product.insertMany([
      { sku: 'CAT-E1', name: 'Category E1', priceCents: 100, onHand: 1, reserved: 0, isActive: true, category: 'electronics' },
      { sku: 'CAT-E2', name: 'Category E2', priceCents: 100, onHand: 1, reserved: 0, isActive: true, category: 'electronics' },
      { sku: 'CAT-F1', name: 'Category F1', priceCents: 100, onHand: 1, reserved: 0, isActive: true, category: 'furniture' },
      { sku: 'CAT-F2', name: 'Category F2', priceCents: 100, onHand: 1, reserved: 0, isActive: false, category: 'furniture' }
    ]);

    const electronics = await request(app).get('/api/v1/products?category=electronics').set('Authorization', `Bearer ${customerToken}`);
    expect(electronics.status).toBe(200);
    expect(electronics.body.products.map((product) => product.sku)).toEqual(['CAT-E1', 'CAT-E2']);
    expect(electronics.body.pagination.total).toBe(2);

    // Inactive products stay hidden inside a filtered category.
    const furniture = await request(app).get('/api/v1/products?category=furniture').set('Authorization', `Bearer ${customerToken}`);
    expect(furniture.body.products.map((product) => product.sku)).toEqual(['CAT-F1']);
    expect(furniture.body.pagination.total).toBe(1);

    const unknown = await request(app).get('/api/v1/products?category=gadgets').set('Authorization', `Bearer ${customerToken}`);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
  });
});
