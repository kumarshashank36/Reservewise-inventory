import { AppError } from '../errors/AppError.js';
import { Product } from '../models/Product.js';

export async function listCatalogProducts() {
  return Product.find({ isActive: true }).sort({ name: 1 });
}

export async function listAdminProducts() {
  return Product.find().sort({ updatedAt: -1 });
}

export async function createProduct(input) {
  return Product.create({ ...input, reserved: 0 });
}

export async function updateProduct(productId, input) {
  const update = {};
  for (const key of ['name', 'description', 'priceCents', 'isActive']) {
    if (input[key] !== undefined) update[key] = input[key];
  }

  // The conditional filter preserves the onHand >= reserved invariant entirely in MongoDB.
  if (input.onHand !== undefined) update.onHand = input.onHand;
  const filter = { _id: productId };
  if (input.onHand !== undefined) filter.$expr = { $gte: [input.onHand, '$reserved'] };

  const product = await Product.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: true });
  if (product) return product;

  const exists = await Product.exists({ _id: productId });
  if (!exists) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  throw new AppError(409, 'INVENTORY_BELOW_RESERVED', 'On-hand inventory cannot be reduced below currently reserved inventory');
}
