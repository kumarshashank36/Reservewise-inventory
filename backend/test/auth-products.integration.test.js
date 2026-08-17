import jwt from 'jsonwebtoken';
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
    email: 'admin@example.com', password: 'correct-horse-battery-staple', role: 'admin'
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
      .send({ sku: 'CHAIR-01', name: 'Task Chair', description: 'A precise chair', priceCents: 12900, onHand: 7, category: 'furniture', imageUrl: 'https://example.com/chair.jpg' });
    expect(created.status).toBe(201);
    expect(created.body.product).toMatchObject({ sku: 'CHAIR-01', available: 7, reserved: 0, category: 'furniture', imageUrl: 'https://example.com/chair.jpg' });

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

  it('updates product details including category and image, and can clear the image', async () => {
    const admin = await adminToken();
    const created = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${admin}`)
      .send({ sku: 'EDIT-01', name: 'Editable Item', priceCents: 1000, onHand: 5, category: 'home', imageUrl: 'https://example.com/before.jpg' });
    const productId = created.body.product._id;

    const updated = await request(app)
      .patch(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Renamed Item', description: 'Now described', priceCents: 2400, category: 'furniture', imageUrl: 'https://example.com/after.jpg' });
    expect(updated.status).toBe(200);
    expect(updated.body.product).toMatchObject({ name: 'Renamed Item', description: 'Now described', priceCents: 2400, category: 'furniture', imageUrl: 'https://example.com/after.jpg' });
    expect(updated.body.product.sku).toBe('EDIT-01'); // SKU stays immutable

    const cleared = await request(app)
      .patch(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ imageUrl: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.product.imageUrl).toBe('');
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

  it('reports a healthy response when the database is connected', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'connected' });
  });

  it('rejects invalid credentials, weak passwords, and duplicate emails', async () => {
    await register('dup@example.com');

    const wrongPassword = await request(app).post('/api/v1/auth/login').send({
      email: 'dup@example.com', password: 'totally-wrong-password', role: 'customer'
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');

    const weakPassword = await request(app).post('/api/v1/auth/register').send({
      name: 'Weak Password', email: 'weak@example.com', password: 'short'
    });
    expect(weakPassword.status).toBe(400);
    expect(weakPassword.body.error.code).toBe('VALIDATION_ERROR');

    const duplicateEmail = await register('dup@example.com');
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects expired tokens and tokens for deleted accounts', async () => {
    const registration = await register('ghost@example.com');
    const userId = registration.body.user.id;

    const expiredToken = jwt.sign(
      { sub: userId, role: 'customer', email: 'ghost@example.com' },
      'test-only-secret-that-is-long-enough-to-sign-jwts',
      { expiresIn: '1ms' }
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const expired = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expiredToken}`);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('INVALID_TOKEN');

    await User.deleteOne({ _id: userId });
    const deleted = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${registration.body.token}`);
    expect(deleted.status).toBe(401);
    expect(deleted.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects malformed reservation identifiers with a consistent validation error', async () => {
    const customer = await register('malformed@example.com');
    const response = await request(app).get('/api/v1/reservations/not-an-object-id').set('Authorization', `Bearer ${customer.body.token}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_IDENTIFIER');
  });

  it('accepts a sign-in when the selected role matches the account role', async () => {
    await register('matching-customer@example.com');
    await register('matching-admin@example.com');
    await User.updateOne({ email: 'matching-admin@example.com' }, { role: 'admin' });

    const customerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'matching-customer@example.com', password: 'correct-horse-battery-staple', role: 'customer'
    });
    expect(customerLogin.status).toBe(200);
    expect(customerLogin.body.user.role).toBe('customer');
    expect(customerLogin.body.token).toBeTruthy();

    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'matching-admin@example.com', password: 'correct-horse-battery-staple', role: 'admin'
    });
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.user.role).toBe('admin');
    expect(adminLogin.body.token).toBeTruthy();
  });

  it('rejects valid credentials when the selected sign-in role does not match', async () => {
    await register('role-mismatch@example.com');

    // A customer account signed in with the Admin toggle.
    const customerAsAdmin = await request(app).post('/api/v1/auth/login').send({
      email: 'role-mismatch@example.com', password: 'correct-horse-battery-staple', role: 'admin'
    });
    expect(customerAsAdmin.status).toBe(403);
    expect(customerAsAdmin.body.error.code).toBe('ROLE_MISMATCH');

    await User.updateOne({ email: 'role-mismatch@example.com' }, { role: 'admin' });

    // An admin account signed in with the Customer toggle.
    const adminAsCustomer = await request(app).post('/api/v1/auth/login').send({
      email: 'role-mismatch@example.com', password: 'correct-horse-battery-staple', role: 'customer'
    });
    expect(adminAsCustomer.status).toBe(403);
    expect(adminAsCustomer.body.error.code).toBe('ROLE_MISMATCH');
  });

  it('never reveals account existence or role for invalid credentials', async () => {
    await register('known@example.com');

    const wrongPassword = await request(app).post('/api/v1/auth/login').send({
      email: 'known@example.com', password: 'not-the-password', role: 'admin'
    });
    const unknownEmail = await request(app).post('/api/v1/auth/login').send({
      email: 'nobody@example.com', password: 'whatever-password', role: 'admin'
    });

    // Both failures are identical 401s: no role mismatch, no account-existence hint.
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('requires the sign-in role and rejects unknown role values', async () => {
    const missingRole = await request(app).post('/api/v1/auth/login').send({
      email: 'known@example.com', password: 'whatever-password'
    });
    expect(missingRole.status).toBe(400);
    expect(missingRole.body.error.code).toBe('VALIDATION_ERROR');

    const invalidRole = await request(app).post('/api/v1/auth/login').send({
      email: 'known@example.com', password: 'whatever-password', role: 'superuser'
    });
    expect(invalidRole.status).toBe(400);
    expect(invalidRole.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an admin token on customer-only routes', async () => {
    const admin = await adminToken();
    const response = await request(app).get('/api/v1/reservations').set('Authorization', `Bearer ${admin}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('lets admins provision accounts and list the team without exposing password hashes', async () => {
    const admin = await adminToken();
    const customer = await register('provision-customer@example.com');

    // Customers cannot reach the team endpoints.
    await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${customer.body.token}`).expect(403);
    await request(app).post('/api/v1/admin/users').set('Authorization', `Bearer ${customer.body.token}`)
      .send({ name: 'Nope', email: 'nope@example.com', password: 'long-enough-password', role: 'admin' })
      .expect(403);

    // Provision a second administrator.
    const created = await request(app).post('/api/v1/admin/users').set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Second Admin', email: 'second-admin@example.com', password: 'long-enough-password', role: 'admin' });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ name: 'Second Admin', email: 'second-admin@example.com', role: 'admin' });
    expect(created.body.user.passwordHash).toBeUndefined();

    // The new admin signs in with the Admin sign-in type...
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'second-admin@example.com', password: 'long-enough-password', role: 'admin'
    });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('admin');

    // ...and is rejected with the Customer sign-in type.
    const mismatched = await request(app).post('/api/v1/auth/login').send({
      email: 'second-admin@example.com', password: 'long-enough-password', role: 'customer'
    });
    expect(mismatched.status).toBe(403);
    expect(mismatched.body.error.code).toBe('ROLE_MISMATCH');

    const list = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${admin}`);
    expect(list.status).toBe(200);
    expect(list.body.users.map((user) => user.email)).toEqual(expect.arrayContaining([
      'second-admin@example.com', 'admin@example.com', 'provision-customer@example.com'
    ]));
    expect(list.body.users.every((user) => user.passwordHash === undefined)).toBe(true);
  });

  it('validates provisioned accounts and rejects duplicate emails', async () => {
    const admin = await adminToken();
    await request(app).post('/api/v1/admin/users').set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Existing', email: 'existing@example.com', password: 'long-enough-password', role: 'customer' })
      .expect(201);

    const duplicate = await request(app).post('/api/v1/admin/users').set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Existing Again', email: 'existing@example.com', password: 'long-enough-password', role: 'admin' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');

    const weakPassword = await request(app).post('/api/v1/admin/users').set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Weak', email: 'weak@example.com', password: 'short', role: 'admin' });
    expect(weakPassword.status).toBe(400);
    expect(weakPassword.body.error.code).toBe('VALIDATION_ERROR');

    const invalidRole = await request(app).post('/api/v1/admin/users').set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Weird', email: 'weird@example.com', password: 'long-enough-password', role: 'superuser' });
    expect(invalidRole.status).toBe(400);
    expect(invalidRole.body.error.code).toBe('VALIDATION_ERROR');

    const invalidImage = await request(app).post('/api/v1/admin/products').set('Authorization', `Bearer ${admin}`)
      .send({ sku: 'BAD-IMG', name: 'Bad Image', priceCents: 100, onHand: 1, imageUrl: 'not-a-url' });
    expect(invalidImage.status).toBe(400);
    expect(invalidImage.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lets admins soft-delete customers while preserving their audit data', async () => {
    const admin = await adminToken();
    const customer = await register('doomed@example.com');
    const customerId = customer.body.user.id;

    // Customers cannot deactivate anyone.
    await request(app).delete(`/api/v1/admin/users/${customerId}`).set('Authorization', `Bearer ${customer.body.token}`).expect(403);

    const deactivated = await request(app).delete(`/api/v1/admin/users/${customerId}`).set('Authorization', `Bearer ${admin}`);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.user.deletedAt).toBeTruthy();

    // The deactivated customer's existing token dies immediately.
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${customer.body.token}`);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    // And they can no longer sign in, even with correct credentials.
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'doomed@example.com', password: 'correct-horse-battery-staple', role: 'customer'
    });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    // A wrong password on a deactivated account must not reveal that the account
    // exists: password verification runs before any account-state disclosure.
    const probe = await request(app).post('/api/v1/auth/login').send({
      email: 'doomed@example.com', password: 'definitely-not-the-password', role: 'customer'
    });
    expect(probe.status).toBe(401);
    expect(probe.body.error.code).toBe('INVALID_CREDENTIALS');

    // The account stays in the team list with its deactivation timestamp.
    const list = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${admin}`);
    const listed = list.body.users.find((user) => user.id === customerId);
    expect(listed).toBeTruthy();
    expect(listed.deletedAt).toBeTruthy();

    // Deactivating again is idempotent.
    const again = await request(app).delete(`/api/v1/admin/users/${customerId}`).set('Authorization', `Bearer ${admin}`);
    expect(again.status).toBe(200);
  });

  it('refuses to deactivate administrator accounts and unknown users', async () => {
    const admin = await adminToken();
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${admin}`);
    const adminId = me.body.user.id;

    const refuseAdmin = await request(app).delete(`/api/v1/admin/users/${adminId}`).set('Authorization', `Bearer ${admin}`);
    expect(refuseAdmin.status).toBe(409);
    expect(refuseAdmin.body.error.code).toBe('CANNOT_DEACTIVATE_ADMIN');

    const missing = await request(app).delete('/api/v1/admin/users/000000000000000000000000').set('Authorization', `Bearer ${admin}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('lets admins reactivate a soft-deleted customer', async () => {
    const admin = await adminToken();
    const customer = await register('boomerang@example.com');
    const customerId = customer.body.user.id;
    await request(app).delete(`/api/v1/admin/users/${customerId}`).set('Authorization', `Bearer ${admin}`).expect(200);

    // The deactivated customer's token is rejected before authorization...
    const deadToken = await request(app).post(`/api/v1/admin/users/${customerId}/activate`).set('Authorization', `Bearer ${customer.body.token}`);
    expect(deadToken.status).toBe(401);
    expect(deadToken.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    // ...and an active customer is refused by the role gate.
    const bystander = await register('bystander@example.com');
    const denied = await request(app).post(`/api/v1/admin/users/${customerId}/activate`).set('Authorization', `Bearer ${bystander.body.token}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    const reactivated = await request(app).post(`/api/v1/admin/users/${customerId}/activate`).set('Authorization', `Bearer ${admin}`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.user.deletedAt).toBeNull();

    // Sign-in works again with the correct sign-in type, and the pre-deactivation token is valid once more.
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'boomerang@example.com', password: 'correct-horse-battery-staple', role: 'customer'
    });
    expect(login.status).toBe(200);

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${customer.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(customerId);
  });

  it('treats reactivating an active or unknown account safely', async () => {
    const admin = await adminToken();
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${admin}`);
    const adminId = me.body.user.id;

    // Administrators are never deactivated, so reactivating one is a harmless idempotent no-op.
    const noop = await request(app).post(`/api/v1/admin/users/${adminId}/activate`).set('Authorization', `Bearer ${admin}`);
    expect(noop.status).toBe(200);
    expect(noop.body.user.deletedAt).toBeNull();

    const missing = await request(app).post('/api/v1/admin/users/000000000000000000000000/activate').set('Authorization', `Bearer ${admin}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');
  });
});
