import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { User } from '../models/User.js';

function ensureJwtSecret() {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required to use authentication');
  return env.JWT_SECRET;
}

export function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role, createdAt: user.createdAt, deletedAt: user.deletedAt ?? null };
}

export function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, email: user.email }, ensureJwtSecret(), { expiresIn: env.JWT_EXPIRES_IN });
}

async function createUser({ name, email, password, role }) {
  const existingUser = await User.exists({ email });
  if (existingUser) throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account already exists for this email address');

  const passwordHash = await bcrypt.hash(password, 12);
  return User.create({ name, email, passwordHash, role });
}

export async function registerUser({ name, email, password }) {
  const user = await createUser({ name, email, password, role: 'customer' });
  return { user: publicUser(user), token: createToken(user) };
}

// Admin-provisioned accounts: any role may be created, but only by an admin.
export async function provisionUser({ name, email, password, role }) {
  const user = await createUser({ name, email, password, role });
  return publicUser(user);
}

export async function listUsers({ page, limit }) {
  const [users, total] = await Promise.all([
    User.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments()
  ]);
  return { users: users.map(publicUser), total };
}

export async function loginUser({ email, password, role }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  // One generic failure for a missing account or a wrong password, so the response
  // never reveals whether an email is registered or which role it has.
  if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  // A soft-deleted account is a distinct, actionable state for the account owner.
  if (user.deletedAt) throw new AppError(401, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated. Contact an administrator for help.');
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  // Credentials are valid, but the account must match the sign-in type the client selected.
  if (user.role !== role) {
    const expected = user.role === 'admin' ? 'an admin' : 'a customer';
    throw new AppError(403, 'ROLE_MISMATCH', `This is ${expected} account. Select the ${user.role === 'admin' ? 'Admin' : 'Customer'} sign-in type and try again.`);
  }
  return { user: publicUser(user), token: createToken(user) };
}

// Soft delete: deactivates a customer account while retaining it (and its reservations)
// as audit data. Administrators cannot be deactivated. Existing tokens die immediately
// because authenticate re-reads the user; pending holds release via the expiry worker.
export async function softDeleteUserByAdmin(targetId) {
  const target = await User.findById(targetId);
  if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Account was not found');
  if (target.role === 'admin') throw new AppError(409, 'CANNOT_DEACTIVATE_ADMIN', 'Administrator accounts cannot be deactivated');
  if (!target.deletedAt) {
    target.deletedAt = new Date();
    await target.save();
  }
  return publicUser(target);
}

// Restores a soft-deleted account. Idempotent: activating an active account is a no-op,
// which also makes activating an administrator (never deactivatable) harmless.
export async function reactivateUserByAdmin(targetId) {
  const target = await User.findById(targetId);
  if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Account was not found');
  if (target.deletedAt) {
    target.deletedAt = null;
    await target.save();
  }
  return publicUser(target);
}
