import { z } from 'zod';
import { PRODUCT_CATEGORIES } from '../config/categories.js';
import { createProduct, listAdminProducts, listCatalogProducts, updateProduct } from '../services/productService.js';
import { paginationMeta, parsePagination } from '../services/pagination.js';

const sku = z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'SKU may contain letters, numbers, hyphens, and underscores');
const inventory = z.number().int().nonnegative().max(10_000_000);
const category = z.enum(PRODUCT_CATEGORIES).optional();
// An empty string is allowed so administrators can clear a product image.
const imageUrl = z.union([z.string().trim().url().max(500), z.literal('')]).optional();
const createProductFields = {
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  category,
  imageUrl,
  priceCents: z.number().int().nonnegative().max(100_000_000),
  isActive: z.boolean().optional()
};
const createSchema = z.object({ sku, ...createProductFields, onHand: inventory }).strict();
const updateSchema = z.object({
  name: createProductFields.name.optional(),
  description: createProductFields.description.optional(),
  category,
  imageUrl,
  priceCents: createProductFields.priceCents.optional(),
  isActive: createProductFields.isActive,
  onHand: inventory.optional()
}).strict().refine((input) => Object.keys(input).length > 0, 'Provide at least one field to update');

const search = z.string().trim().max(100).optional();
const catalogQuery = z.object({
  category,
  search,
  sort: z.enum(['name', 'price-asc', 'price-desc']).default('name')
});
const adminQuery = z.object({
  category,
  search,
  // Enum+transform rather than z.coerce.boolean(): coercion turns the string 'false' into true.
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  // Name is the stable default: editing or toggling a product never moves it in the list.
  sort: z.enum(['updatedAt-desc', 'name', 'price-asc', 'price-desc']).default('name')
});

export async function listCatalog(req, res) {
  const { page, limit } = parsePagination(req.query);
  const { category: selectedCategory, search: searchTerm, sort } = catalogQuery.parse(req.query);
  const { products, total } = await listCatalogProducts({ page, limit, category: selectedCategory, search: searchTerm, sort });
  res.json({ products, pagination: paginationMeta(page, limit, total) });
}

export async function listAdmin(req, res) {
  const { page, limit } = parsePagination(req.query);
  const { category: selectedCategory, search: searchTerm, sort, active } = adminQuery.parse(req.query);
  const { products, total } = await listAdminProducts({ page, limit, category: selectedCategory, search: searchTerm, sort, active });
  res.json({ products, pagination: paginationMeta(page, limit, total) });
}

export async function create(req, res) {
  const product = await createProduct(createSchema.parse(req.body));
  res.status(201).json({ product });
}

export async function update(req, res) {
  const product = await updateProduct(req.params.productId, updateSchema.parse(req.body));
  res.json({ product });
}
