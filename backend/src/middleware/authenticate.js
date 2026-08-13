import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { User } from '../models/User.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'A bearer token is required');
    if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required to use authentication');

    const payload = jwt.verify(header.slice(7), env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) throw new AppError(401, 'INVALID_TOKEN', 'The token belongs to a deleted account');
    req.user = { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
    return next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'INVALID_TOKEN', 'The authentication token is invalid or expired'));
    }
    return next(error);
  }
}
