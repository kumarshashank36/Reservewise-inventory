import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Product } from '../src/models/Product.js';
import { Reservation } from '../src/models/Reservation.js';
import { expireDueReservations } from '../src/services/reservationService.js';
import { User } from '../src/models/User.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/database.js';

const app = createApp();
const password = 'correct-horse-battery-staple';

async function register(email) {
  const response = await request(app).post('/api/v1/auth/register').send({ name: 'Reservation Customer', email, password });
  return response.body.token;
}

async function createProduct({ sku = 'ITEM-01', name = 'Reserved Item', onHand = 5, priceCents = 9900 } = {}) {
  const customerToken = await register(`admin-${sku}@example.com`);
  await User.updateOne({ email: `admin-${sku}@example.com` }, { role: 'admin' });
  const admin = await request(app).post('/api/v1/auth/login').send({ email: `admin-${sku}@example.com`, password });
  const response = await request(app).post('/api/v1/admin/products').set('Authorization', `Bearer ${admin.body.token}`)
    .send({ sku, name, onHand, priceCents });
  return response.body.product;
}

function reserve(token, items, key) {
  return request(app).post('/api/v1/reservations').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send({ items });
}

describe('reservation API', () => {
  beforeAll(startTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(stopTestDatabase);

  it('creates a multi-product reservation atomically and replays an idempotent retry', async () => {
    const first = await createProduct({ sku: 'DESK-01', name: 'Standing Desk', onHand: 4 });
    const second = await createProduct({ sku: 'LAMP-02', name: 'Studio Lamp', onHand: 3 });
    const customer = await register('reserve@example.com');
    const body = [{ productId: first._id, quantity: 2 }, { productId: second._id, quantity: 1 }];

    const initial = await reserve(customer, body, 'reservation-retry-key-001');
    expect(initial.status).toBe(201);
    expect(initial.body.reservation.items).toHaveLength(2);
    expect(initial.body.reservation.status).toBe('pending');

    const retry = await reserve(customer, body, 'reservation-retry-key-001');
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotency-replayed']).toBe('true');
    expect(retry.body.reservation._id).toBe(initial.body.reservation._id);
    expect((await Product.findById(first._id)).reserved).toBe(2);
    expect((await Product.findById(second._id)).reserved).toBe(1);
  });

  it('rolls back all product increments when one line cannot be fulfilled', async () => {
    const first = await createProduct({ sku: 'MONITOR-01', name: 'Monitor', onHand: 3 });
    const second = await createProduct({ sku: 'MOUSE-01', name: 'Mouse', onHand: 1 });
    const customer = await register('atomic@example.com');

    const response = await reserve(customer, [{ productId: first._id, quantity: 1 }, { productId: second._id, quantity: 2 }], 'atomic-failure-key-001');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_INVENTORY');
    expect((await Product.findById(first._id)).reserved).toBe(0);
    expect((await Product.findById(second._id)).reserved).toBe(0);
    expect(await Reservation.countDocuments()).toBe(0);
  });

  it('releases inventory exactly once when a reservation is cancelled', async () => {
    const product = await createProduct({ sku: 'KEYBOARD-01', name: 'Keyboard', onHand: 2 });
    const customer = await register('cancel@example.com');
    const reservation = await reserve(customer, [{ productId: product._id, quantity: 2 }], 'cancel-reservation-key-001');

    const cancellation = await request(app).post(`/api/v1/reservations/${reservation.body.reservation._id}/cancel`)
      .set('Authorization', `Bearer ${customer}`);
    expect(cancellation.status).toBe(200);
    expect(cancellation.body.reservation.status).toBe('cancelled');
    await request(app).post(`/api/v1/reservations/${reservation.body.reservation._id}/cancel`).set('Authorization', `Bearer ${customer}`).expect(200);
    expect((await Product.findById(product._id)).reserved).toBe(0);
  });

  it('keeps completed inventory consumed and isolates a customer reservation from other customers', async () => {
    const product = await createProduct({ sku: 'TABLE-01', name: 'Table', onHand: 3 });
    const owner = await register('owner@example.com');
    const stranger = await register('stranger@example.com');
    const created = await reserve(owner, [{ productId: product._id, quantity: 1 }], 'complete-reservation-key-001');

    await request(app).get(`/api/v1/reservations/${created.body.reservation._id}`).set('Authorization', `Bearer ${stranger}`).expect(404);
    const completion = await request(app).post(`/api/v1/reservations/${created.body.reservation._id}/complete`).set('Authorization', `Bearer ${owner}`);
    expect(completion.status).toBe(200);
    expect(completion.body.reservation.status).toBe('completed');
    expect((await Product.findById(product._id)).reserved).toBe(1);
  });

  it('expires reservations transactionally and makes their inventory available again', async () => {
    const product = await createProduct({ sku: 'SHELF-01', name: 'Shelf', onHand: 2 });
    const customer = await register('expiry@example.com');
    const created = await reserve(customer, [{ productId: product._id, quantity: 2 }], 'expiry-reservation-key-001');
    await Reservation.updateOne({ _id: created.body.reservation._id }, { expiresAt: new Date(Date.now() - 1) });

    expect(await expireDueReservations()).toBe(1);
    expect((await Reservation.findById(created.body.reservation._id)).status).toBe('expired');
    expect((await Product.findById(product._id)).reserved).toBe(0);
  });

  it('never over-reserves when simultaneous attempts contend for the same stock', async () => {
    const product = await createProduct({ sku: 'LIMITED-01', name: 'Limited Item', onHand: 3 });
    const customer = await register('concurrency@example.com');
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => reserve(
      customer, [{ productId: product._id, quantity: 1 }], `concurrent-reservation-key-${index}`
    )));
    const successful = attempts.filter((response) => response.status === 201);
    const stored = await Product.findById(product._id);

    expect(successful.length).toBeLessThanOrEqual(3);
    expect(stored.reserved).toBe(successful.length);
    expect(stored.reserved).toBeLessThanOrEqual(stored.onHand);
  });
});
