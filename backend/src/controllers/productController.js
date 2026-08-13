import { z } from 'zod';
import { createProduct, listAdminProducts, listCatalogProducts, updateProduct } from '../services/productService.js';

const sku = z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'SKU may contain letters, numbers, hyphens, and underscores');
const inventory = z.number().int().nonnegative().max(10_000_000);
const createProductFields = {
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  priceCents: z.number().int().nonnegative().max(100_000_000),
  isActive: z.boolean().optional()
};
const createSchema = z.object({ sku, ...createProductFields, onHand: inventory }).strict();
const updateSchema = z.object({
  name: createProductFields.name.optional(),
  description: createProductFields.description.optional(),
  priceCents: createProductFields.priceCents.optional(),
  isActive: createProductFields.isActive,
  onHand: inventory.optional()
}).strict().refine((input) => Object.keys(input).length > 0, 'Provide at least one field to update');

export async function listCatalog(req, res) {
  res.json({ products: await listCatalogProducts() });
}

export async function listAdmin(req, res) {
  res.json({ products: await listAdminProducts() });
}

export async function create(req, res) {
  const product = await createProduct(createSchema.parse(req.body));
  res.status(201).json({ product });
}

export async function update(req, res) {
  const product = await updateProduct(req.params.productId, updateSchema.parse(req.body));
  res.json({ product });
}
