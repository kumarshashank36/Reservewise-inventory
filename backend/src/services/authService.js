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
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}

export function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, email: user.email }, ensureJwtSecret(), { expiresIn: env.JWT_EXPIRES_IN });
}

export async function registerUser({ name, email, password }) {
  const existingUser = await User.exists({ email });
  if (existingUser) throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account already exists for this email address');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash });
  return { user: publicUser(user), token: createToken(user) };
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  return { user: publicUser(user), token: createToken(user) };
}
