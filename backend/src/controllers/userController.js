import { z } from 'zod';
import { listUsers, provisionUser, reactivateUserByAdmin, softDeleteUserByAdmin } from '../services/authService.js';

const email = z.string().trim().toLowerCase().email();
const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password: z.string().min(10, 'Password must contain at least 10 characters').max(128),
  role: z.enum(['customer', 'admin'])
}).strict();

export async function list(req, res) {
  res.json({ users: await listUsers() });
}

export async function create(req, res) {
  const user = await provisionUser(createUserSchema.parse(req.body));
  res.status(201).json({ user });
}

export async function remove(req, res) {
  res.json({ user: await softDeleteUserByAdmin(req.params.userId) });
}

export async function reactivate(req, res) {
  res.json({ user: await reactivateUserByAdmin(req.params.userId) });
}
