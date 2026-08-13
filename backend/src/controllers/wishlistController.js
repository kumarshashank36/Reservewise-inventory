import mongoose from 'mongoose';
import { z } from 'zod';
import { addWishlistItem, listWishlistItems, removeWishlistItem } from '../services/wishlistService.js';

const productId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid product identifier');
const addSchema = z.object({ productId }).strict();

export async function list(req, res) {
  res.json({ items: await listWishlistItems(req.user.id) });
}

export async function add(req, res) {
  const { item, created } = await addWishlistItem(req.user.id, addSchema.parse(req.body).productId);
  res.status(created ? 201 : 200).json({ item: { productId: item.productId.toString(), addedAt: item.createdAt } });
}

export async function remove(req, res) {
  const { productId: targetId } = z.object({ productId }).strict().parse(req.params);
  res.json(await removeWishlistItem(req.user.id, targetId));
}
