import mongoose from 'mongoose';
import { z } from 'zod';
import { cancelReservation, completeReservation, createReservation, getCustomerReservation, listAdminReservations, listCustomerReservations } from '../services/reservationService.js';
import { paginationMeta, parsePagination } from '../services/pagination.js';

const productId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid product identifier');
const createSchema = z.object({
  items: z.array(z.object({ productId, quantity: z.number().int().min(1).max(10_000) }).strict()).min(1).max(25)
}).strict();

function idempotencyKey(req) {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || key.trim().length < 8 || key.length > 128) {
    throw new z.ZodError([{ code: 'custom', path: ['headers', 'idempotency-key'], message: 'Idempotency-Key must be between 8 and 128 characters' }]);
  }
  return key.trim();
}

export async function create(req, res) {
  const input = createSchema.parse(req.body);
  const result = await createReservation({ customerId: req.user.id, items: input.items, idempotencyKey: idempotencyKey(req) });
  res.status(result.replayed ? 200 : 201).set('Idempotency-Replayed', String(result.replayed)).json({ reservation: result.reservation });
}

export async function listMine(req, res) {
  const { page, limit } = parsePagination(req.query);
  const { reservations, total } = await listCustomerReservations(req.user.id, { page, limit });
  res.json({ reservations, pagination: paginationMeta(page, limit, total) });
}

export async function getMine(req, res) {
  res.json({ reservation: await getCustomerReservation(req.user.id, req.params.reservationId) });
}

export async function cancel(req, res) {
  res.json({ reservation: await cancelReservation(req.user.id, req.params.reservationId) });
}

export async function complete(req, res) {
  res.json({ reservation: await completeReservation(req.user.id, req.params.reservationId) });
}

const adminReservationQuery = z.object({
  status: z.enum(['pending', 'completed', 'cancelled', 'expired']).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['createdAt-desc', 'createdAt-asc']).default('createdAt-desc')
});

export async function listAdmin(req, res) {
  const { page, limit } = parsePagination(req.query);
  const { status, search, sort } = adminReservationQuery.parse(req.query);
  const { reservations, total } = await listAdminReservations({ page, limit, status, search, sort });
  res.json({ reservations, pagination: paginationMeta(page, limit, total) });
}
