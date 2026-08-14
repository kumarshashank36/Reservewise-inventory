import { AppError } from '../errors/AppError.js';
import { Product } from '../models/Product.js';
import { escapeRegex } from './listQuery.js';

const CATALOG_SORTS = {
  name: { name: 1 },
  'price-asc': { priceCents: 1, name: 1 },
  'price-desc': { priceCents: -1, name: 1 }
};

const ADMIN_SORTS = {
  'updatedAt-desc': { updatedAt: -1 },
  name: { name: 1 },
  'price-asc': { priceCents: 1, name: 1 },
  'price-desc': { priceCents: -1, name: 1 }
};

function withSearch(filter, search, fields) {
  const regex = new RegExp(escapeRegex(search), 'i');
  filter.$or = fields.map((field) => ({ [field]: regex }));
}

export async function listCatalogProducts({ page, limit, category, search, sort }) {
  const filter = { isActive: true };
  if (category) filter.category = category;
  if (search) withSearch(filter, search, ['name', 'sku']);
  const sortOption = CATALOG_SORTS[sort] ?? CATALOG_SORTS.name;
  const [products, total] = await Promise.all([
    Product.find(filter).sort(sortOption).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter)
  ]);
  return { products, total };
}

export async function listAdminProducts({ page, limit, category, search, sort, active }) {
  const filter = {};
  if (category) filter.category = category;
  if (search) withSearch(filter, search, ['name', 'sku']);
  if (active !== undefined) filter.isActive = active;
  const sortOption = ADMIN_SORTS[sort] ?? ADMIN_SORTS['updatedAt-desc'];
  const [products, total] = await Promise.all([
    Product.find(filter).sort(sortOption).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter)
  ]);
  return { products, total };
}

export async function createProduct(input) {
  return Product.create({ ...input, reserved: 0 });
}

export async function updateProduct(productId, input) {
  const update = {};
  for (const key of ['name', 'description', 'category', 'imageUrl', 'priceCents', 'isActive']) {
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
