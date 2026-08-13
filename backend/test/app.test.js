import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('application foundation', () => {
  const app = createApp();

  it('reports a degraded health response when the database is not connected', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'degraded', database: 'not-connected', service: 'inventory-reservation-api' });
  });

  it('returns a consistent JSON error for unknown routes', async () => {
    const response = await request(app).get('/api/v1/unknown');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
