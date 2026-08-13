import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { Product } from '../models/Product.js';
import { Reservation } from '../models/Reservation.js';
import { runTransaction } from './transaction.js';

const HOLD_DURATION_MS = env.HOLD_MINUTES * 60 * 1000;

function normaliseItems(items) {
  const quantities = new Map();
  for (const item of items) {
    const id = item.productId.toString();
    quantities.set(id, (quantities.get(id) ?? 0) + item.quantity);
  }
  return [...quantities.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

function assertSafeQuantities(items) {
  if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000)) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Reservation quantities must be whole numbers between 1 and 10,000');
  }
}

async function releaseItems(reservation, session) {
  for (const item of reservation.items) {
    const result = await Product.updateOne(
      { _id: item.productId, reserved: { $gte: item.quantity } },
      { $inc: { reserved: -item.quantity } },
      { session }
    );
    if (result.modifiedCount !== 1) {
      throw new Error(`Inventory integrity violation while releasing reservation ${reservation._id}`);
    }
  }
}

async function transitionPendingReservation(reservation, status, session, now) {
  // Claim the state transition first: only one actor may move a pending reservation.
  // The loser gets a clean conflict instead of double-releasing inventory.
  const timestampField = status === 'cancelled' ? 'cancelledAt' : 'expiredAt';
  const claimed = await Reservation.updateOne(
    { _id: reservation._id, status: 'pending' },
    { $set: { status, [timestampField]: now } },
    { session }
  );
  if (claimed.modifiedCount !== 1) {
    throw new AppError(409, 'RESERVATION_STATE_CHANGED', `The reservation changed state before it could be ${status}`);
  }
  await releaseItems(reservation, session);
  return Reservation.findById(reservation._id).session(session);
}

async function consumeItems(reservation, session) {
  for (const item of reservation.items) {
    const result = await Product.updateOne(
      { _id: item.productId, onHand: { $gte: item.quantity }, reserved: { $gte: item.quantity } },
      { $inc: { onHand: -item.quantity, reserved: -item.quantity } },
      { session }
    );
    if (result.modifiedCount !== 1) {
      throw new Error(`Inventory integrity violation while completing reservation ${reservation._id}`);
    }
  }
}

export async function createReservation({ customerId, items, idempotencyKey }) {
  const normalisedItems = normaliseItems(items);
  assertSafeQuantities(normalisedItems);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);

  try {
    return await runTransaction(async (session) => {
      const existing = await Reservation.findOne({ customerId, idempotencyKey }).session(session);
      if (existing) return { reservation: existing, replayed: true };

      const productIds = normalisedItems.map((item) => new mongoose.Types.ObjectId(item.productId));
      const products = await Product.find({ _id: { $in: productIds } }).session(session);
      const productsById = new Map(products.map((product) => [product._id.toString(), product]));
      if (products.length !== normalisedItems.length) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'One or more products were not found');

      const snapshots = [];
      for (const item of normalisedItems) {
        const product = productsById.get(item.productId);
        if (!product.isActive) throw new AppError(409, 'PRODUCT_INACTIVE', `${product.name} is not available for reservation`);
        const increment = await Product.updateOne(
          {
            _id: product._id,
            isActive: true,
            $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, item.quantity] }
          },
          { $inc: { reserved: item.quantity } },
          { session }
        );
        if (increment.modifiedCount !== 1) throw new AppError(409, 'INSUFFICIENT_INVENTORY', `${product.name} no longer has enough available inventory`);
        snapshots.push({ productId: product._id, sku: product.sku, name: product.name, quantity: item.quantity, priceCents: product.priceCents });
      }

      const [reservation] = await Reservation.create([{ customerId, items: snapshots, idempotencyKey, expiresAt }], { session });
      return { reservation, replayed: false };
    });
  } catch (error) {
    // A second request can race after the initial lookup. The unique index makes the winning reservation authoritative.
    if (error?.code === 11000) {
      const existing = await Reservation.findOne({ customerId, idempotencyKey });
      if (existing) return { reservation: existing, replayed: true };
    }
    throw error;
  }
}

export async function listCustomerReservations(customerId) {
  return Reservation.find({ customerId }).sort({ createdAt: -1 });
}

export async function getCustomerReservation(customerId, reservationId) {
  const reservation = await Reservation.findOne({ _id: reservationId, customerId });
  if (!reservation) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation was not found');
  return reservation;
}

export async function listAdminReservations() {
  return Reservation.find().populate('customerId', 'name email').sort({ createdAt: -1 });
}

async function releaseExpiredReservation(reservationId, now = new Date()) {
  return runTransaction(async (session) => {
    const reservation = await Reservation.findOne({ _id: reservationId, status: 'pending', expiresAt: { $lte: now } }).session(session);
    if (!reservation) return null;
    return transitionPendingReservation(reservation, 'expired', session, now);
  });
}

export async function expireDueReservations({ limit = 100 } = {}) {
  const candidates = await Reservation.find({ status: 'pending', expiresAt: { $lte: new Date() } }).select('_id').limit(limit).lean();
  const results = await Promise.all(candidates.map(({ _id }) => releaseExpiredReservation(_id)));
  return results.filter(Boolean).length;
}

export async function cancelReservation(customerId, reservationId) {
  const result = await runTransaction(async (session) => {
    const reservation = await Reservation.findOne({ _id: reservationId, customerId }).session(session);
    if (!reservation) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation was not found');
    if (reservation.status === 'cancelled') return { reservation, alreadyTerminal: true };
    if (reservation.status !== 'pending') throw new AppError(409, 'RESERVATION_NOT_CANCELLABLE', 'Only pending reservations can be cancelled');
    if (reservation.expiresAt <= new Date()) return { expired: true, reservation: await transitionPendingReservation(reservation, 'expired', session, new Date()) };
    return { reservation: await transitionPendingReservation(reservation, 'cancelled', session, new Date()) };
  });
  if (result.expired) throw new AppError(409, 'RESERVATION_EXPIRED', 'This reservation expired and its inventory was released');
  return result.reservation;
}

export async function completeReservation(customerId, reservationId) {
  const result = await runTransaction(async (session) => {
    const reservation = await Reservation.findOne({ _id: reservationId, customerId }).session(session);
    if (!reservation) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation was not found');
    if (reservation.status === 'completed') return { reservation };
    if (reservation.status !== 'pending') throw new AppError(409, 'RESERVATION_NOT_COMPLETABLE', 'Only pending reservations can be completed');
    const now = new Date();
    if (reservation.expiresAt <= now) return { expired: true, reservation: await transitionPendingReservation(reservation, 'expired', session, now) };
    // The claim re-checks expiry inside the update so a completion cannot land after its hold window ended.
    const claimed = await Reservation.updateOne(
      { _id: reservation._id, status: 'pending', expiresAt: { $gt: now } },
      { $set: { status: 'completed', completedAt: now } },
      { session }
    );
    if (claimed.modifiedCount !== 1) {
      throw new AppError(409, 'RESERVATION_STATE_CHANGED', 'The reservation changed state before it could be completed');
    }
    // Completion consumes the units: onHand and reserved move together, so the sale reduces
    // physical stock without breaking the onHand >= reserved invariant.
    await consumeItems(reservation, session);
    return { reservation: await Reservation.findById(reservation._id).session(session) };
  });
  if (result.expired) throw new AppError(409, 'RESERVATION_EXPIRED', 'This reservation expired and its inventory was released');
  return result.reservation;
}
