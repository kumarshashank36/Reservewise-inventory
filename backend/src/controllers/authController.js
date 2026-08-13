import { z } from 'zod';
import { loginUser, publicUser, registerUser } from '../services/authService.js';

const password = z.string().min(10, 'Password must contain at least 10 characters').max(128);
const email = z.string().trim().toLowerCase().email();
const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email, password }).strict();
const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();

export async function register(req, res) {
  const input = registerSchema.parse(req.body);
  const result = await registerUser(input);
  res.status(201).json(result);
}

export async function login(req, res) {
  const input = loginSchema.parse(req.body);
  res.json(await loginUser(input));
}

export function me(req, res) {
  res.json({ user: publicUser({ _id: req.user.id, ...req.user }) });
}
