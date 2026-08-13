import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { assertRuntimeEnvironment, env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

async function seed() {
  assertRuntimeEnvironment();
  if (!adminPassword || adminPassword.length < 10) throw new Error('SEED_ADMIN_PASSWORD must contain at least 10 characters');
  await connectDatabase(env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await User.updateOne(
    { email: adminEmail },
    { $setOnInsert: { name: 'Inventory Admin', email: adminEmail, passwordHash, role: 'admin' } },
    { upsert: true }
  );
  await Product.bulkWrite([
    { updateOne: { filter: { sku: 'LUMEN-DESK' }, update: { $setOnInsert: { sku: 'LUMEN-DESK', name: 'Lumen Desk Lamp', description: 'A focused LED task light with an adjustable arm.', priceCents: 12900, onHand: 12, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'FORM-CHAIR' }, update: { $setOnInsert: { sku: 'FORM-CHAIR', name: 'Form Task Chair', description: 'Ergonomic daily seating for focused work.', priceCents: 34900, onHand: 8, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'GRID-SHELF' }, update: { $setOnInsert: { sku: 'GRID-SHELF', name: 'Grid Storage Shelf', description: 'Modular shelving designed for adaptable spaces.', priceCents: 19900, onHand: 16, reserved: 0, isActive: true } }, upsert: true } }
  ]);
  logger.info({ adminEmail }, 'Seed data is ready');
  await disconnectDatabase();
}

seed().catch(async (error) => {
  logger.fatal({ err: error }, 'Seeding failed');
  await disconnectDatabase();
  process.exit(1);
});
