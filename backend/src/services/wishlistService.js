import { AppError } from '../errors/AppError.js';
import { Product } from '../models/Product.js';
import { WishlistItem } from '../models/WishlistItem.js';

// Wishlist reads return a fresh product view: availability is computed from the
// live onHand/reserved counters at read time, never cached in the wishlist.
function publicProduct(product) {
  return {
    _id: product._id.toString(),
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category,
    imageUrl: product.imageUrl,
    priceCents: product.priceCents,
    isActive: product.isActive,
    onHand: product.onHand,
    reserved: product.reserved,
    available: product.onHand - product.reserved,
  };
}

export async function listWishlistItems(customerId, { page, limit }) {
  const filter = { customerId };
  const [items, total] = await Promise.all([
    WishlistItem.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WishlistItem.countDocuments(filter),
  ]);
  const products = await Product.find({ _id: { $in: items.map((item) => item.productId) } }).lean();
  const productsById = new Map(products.map((product) => [product._id.toString(), product]));
  const mapped = items
    .filter((item) => productsById.has(item.productId.toString()))
    .map((item) => ({ product: publicProduct(productsById.get(item.productId.toString())), addedAt: item.createdAt }));
  return { items: mapped, total };
}

export async function addWishlistItem(customerId, productId) {
  const product = await Product.findById(productId);
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');

  const existing = await WishlistItem.findOne({ customerId, productId });
  if (existing) return { item: existing, created: false };
  try {
    const item = await WishlistItem.create({ customerId, productId });
    return { item, created: true };
  } catch (error) {
    // A concurrent double-add loses on the unique index; the winner is authoritative.
    if (error?.code === 11000) {
      const winner = await WishlistItem.findOne({ customerId, productId });
      return { item: winner, created: false };
    }
    throw error;
  }
}

export async function removeWishlistItem(customerId, productId) {
  const result = await WishlistItem.deleteOne({ customerId, productId });
  return { removed: result.deletedCount === 1 };
}
