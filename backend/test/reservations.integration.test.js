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

  it('consumes completed inventory and isolates a customer reservation from other customers', async () => {
    const product = await createProduct({ sku: 'TABLE-01', name: 'Table', onHand: 3 });
    const owner = await register('owner@example.com');
    const stranger = await register('stranger@example.com');
    const created = await reserve(owner, [{ productId: product._id, quantity: 1 }], 'complete-reservation-key-001');

    await request(app).get(`/api/v1/reservations/${created.body.reservation._id}`).set('Authorization', `Bearer ${stranger}`).expect(404);
    const completion = await request(app).post(`/api/v1/reservations/${created.body.reservation._id}/complete`).set('Authorization', `Bearer ${owner}`);
    expect(completion.status).toBe(200);
    expect(completion.body.reservation.status).toBe('completed');

    // Completion consumes the units: onHand and reserved move together, availability is unchanged.
    const stored = await Product.findById(product._id);
    expect(stored.onHand).toBe(2);
    expect(stored.reserved).toBe(0);
    expect(stored.available).toBe(2);
  });

  it('merges duplicate product lines into a single line', async () => {
    const product = await createProduct({ sku: 'MERGE-01', name: 'Merged Item', onHand: 3 });
    const customer = await register('merge@example.com');

    const response = await reserve(
      customer,
      [{ productId: product._id, quantity: 2 }, { productId: product._id, quantity: 1 }],
      'merge-lines-key-001'
    );

    expect(response.status).toBe(201);
    expect(response.body.reservation.items).toHaveLength(1);
    expect(response.body.reservation.items[0].quantity).toBe(3);
    expect((await Product.findById(product._id)).reserved).toBe(3);
  });

  it('rejects a merged request that exceeds availability and leaves no partial hold', async () => {
    const product = await createProduct({ sku: 'MERGE-02', name: 'Merged Item', onHand: 2 });
    const customer = await register('merge-short@example.com');

    const response = await reserve(
      customer,
      [{ productId: product._id, quantity: 2 }, { productId: product._id, quantity: 1 }],
      'merge-lines-key-002'
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_INVENTORY');
    expect((await Product.findById(product._id)).reserved).toBe(0);
    expect(await Reservation.countDocuments()).toBe(0);
  });

  it('replays concurrent duplicate idempotency keys without reserving twice', async () => {
    const product = await createProduct({ sku: 'DUPKEY-01', name: 'Duplicate Key Item', onHand: 5 });
    const customer = await register('dupkey@example.com');
    const body = [{ productId: product._id, quantity: 2 }];

    const [first, second] = await Promise.all([
      reserve(customer, body, 'duplicate-race-key-001'),
      reserve(customer, body, 'duplicate-race-key-001')
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.reservation._id).toBe(second.body.reservation._id);
    expect((await Product.findById(product._id)).reserved).toBe(2);
    expect(await Reservation.countDocuments()).toBe(1);
  });

  it('requires an idempotency key on reservation creation', async () => {
    const product = await createProduct({ sku: 'NOKEY-01', name: 'No Key Item', onHand: 2 });
    const customer = await register('no-key@example.com');

    const response = await request(app).post('/api/v1/reservations')
      .set('Authorization', `Bearer ${customer}`)
      .send({ items: [{ productId: product._id, quantity: 1 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never over-reserves when two different customers contend for the final unit', async () => {
    const product = await createProduct({ sku: 'LAST-ONE-01', name: 'Final Unit', onHand: 1 });
    const firstCustomer = await register('contender-1@example.com');
    const secondCustomer = await register('contender-2@example.com');

    const attempts = await Promise.all([
      reserve(firstCustomer, [{ productId: product._id, quantity: 1 }], 'contender-key-001'),
      reserve(secondCustomer, [{ productId: product._id, quantity: 1 }], 'contender-key-002')
    ]);

    expect(attempts.filter((response) => response.status === 201)).toHaveLength(1);
    const stored = await Product.findById(product._id);
    expect(stored.reserved).toBe(1);
    expect(stored.reserved).toBeLessThanOrEqual(stored.onHand);
  });

  it('releases inventory exactly once when cancellation races the expiry worker', async () => {
    const product = await createProduct({ sku: 'RACE-CANCEL-01', name: 'Racing Item', onHand: 4 });
    const customer = await register('race-cancel@example.com');
    const created = await reserve(customer, [{ productId: product._id, quantity: 2 }], 'race-cancel-key-001');
    await Reservation.updateOne({ _id: created.body.reservation._id }, { expiresAt: new Date(Date.now() - 1) });

    const [cancellation] = await Promise.all([
      request(app).post(`/api/v1/reservations/${created.body.reservation._id}/cancel`).set('Authorization', `Bearer ${customer}`),
      expireDueReservations()
    ]);

    // Both actors are eligible; whichever loses the claim gets a clean conflict, never a double release.
    expect(cancellation.status).toBe(409);
    const stored = await Reservation.findById(created.body.reservation._id);
    expect(stored.status).toBe('expired');
    expect((await Product.findById(product._id)).reserved).toBe(0);
    expect((await Product.findById(product._id)).onHand).toBe(4);
  });

  it('never completes or double-releases when completion races the expiry worker', async () => {
    const product = await createProduct({ sku: 'RACE-COMPLETE-01', name: 'Racing Item', onHand: 4 });
    const customer = await register('race-complete@example.com');
    const created = await reserve(customer, [{ productId: product._id, quantity: 2 }], 'race-complete-key-001');
    await Reservation.updateOne({ _id: created.body.reservation._id }, { expiresAt: new Date(Date.now() - 1) });

    const [completion] = await Promise.all([
      request(app).post(`/api/v1/reservations/${created.body.reservation._id}/complete`).set('Authorization', `Bearer ${customer}`),
      expireDueReservations()
    ]);

    // The expired hold wins: the completion must neither consume stock nor release it twice.
    expect(completion.status).toBe(409);
    const stored = await Reservation.findById(created.body.reservation._id);
    expect(stored.status).toBe('expired');
    const productAfter = await Product.findById(product._id);
    expect(productAfter.reserved).toBe(0);
    expect(productAfter.onHand).toBe(4);
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
