import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/database.js';

const app = createApp();

async function register(email = 'customer@example.com') {
  const response = await request(app).post('/api/v1/auth/register').send({
    name: 'Jamie Customer', email, password: 'correct-horse-battery-staple'
  });
  return response;
}

async function adminToken() {
  await register('admin@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });
  const login = await request(app).post('/api/v1/auth/login').send({
    email: 'admin@example.com', password: 'correct-horse-battery-staple'
  });
  return login.body.token;
}

describe('auth and inventory API', () => {
  beforeAll(startTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  it('registers, authenticates, and protects the current-user endpoint', async () => {
    const registration = await register('MIXED@Example.COM');
    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({ email: 'mixed@example.com', role: 'customer' });
    expect(registration.body.user.passwordHash).toBeUndefined();

    const unauthenticated = await request(app).get('/api/v1/auth/me');
    expect(unauthenticated.status).toBe(401);

    const currentUser = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registration.body.token}`);
    expect(currentUser.status).toBe(200);
    expect(currentUser.body.user.email).toBe('mixed@example.com');
  });

  it('lets admins create inventory and exposes only active products to customers', async () => {
    const admin = await adminToken();
    const customer = await register();

    const denied = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${customer.body.token}`)
      .send({ sku: 'DENIED', name: 'Denied', priceCents: 100, onHand: 1 });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${admin}`)
      .send({ sku: 'CHAIR-01', name: 'Task Chair', description: 'A precise chair', priceCents: 12900, onHand: 7 });
    expect(created.status).toBe(201);
    expect(created.body.product).toMatchObject({ sku: 'CHAIR-01', available: 7, reserved: 0 });

    const catalog = await request(app).get('/api/v1/products').set('Authorization', `Bearer ${customer.body.token}`);
    expect(catalog.status).toBe(200);
    expect(catalog.body.products).toHaveLength(1);

    await request(app)
      .patch(`/api/v1/admin/products/${created.body.product._id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ isActive: false })
      .expect(200);

    const hiddenCatalog = await request(app).get('/api/v1/products').set('Authorization', `Bearer ${customer.body.token}`);
    expect(hiddenCatalog.body.products).toHaveLength(0);
  });

  it('refuses an inventory adjustment that conflicts with existing reservations', async () => {
    const admin = await adminToken();
    const created = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${admin}`)
      .send({ sku: 'LAMP-01', name: 'Desk Lamp', priceCents: 5900, onHand: 5 });
    const productId = created.body.product._id;
    await Product.updateOne({ _id: productId }, { reserved: 3 });

    const response = await request(app)
      .patch(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ onHand: 2 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVENTORY_BELOW_RESERVED');
    expect((await Product.findById(productId)).onHand).toBe(5);
  });
});
