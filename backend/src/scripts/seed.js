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
  // SEED_ADMIN_RESET=true (used by npm run verify:ui) re-applies the password so the
  // verification checklist's admin credentials always work, even on an existing database.
  const update = { $setOnInsert: { name: 'Inventory Admin', email: adminEmail, role: 'admin' } };
  if (process.env.SEED_ADMIN_RESET === 'true') update.$set = { passwordHash };
  else update.$setOnInsert.passwordHash = passwordHash;
  await User.updateOne({ email: adminEmail }, update, { upsert: true });
  // Twelve products so the paginated catalog and inventory views are multi-page out of the box.
  await Product.bulkWrite([
    { updateOne: { filter: { sku: 'LUMEN-DESK' }, update: { $setOnInsert: { sku: 'LUMEN-DESK', name: 'Lumen Desk Lamp', description: 'A focused LED task light with an adjustable arm.', priceCents: 12900, onHand: 12, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'FORM-CHAIR' }, update: { $setOnInsert: { sku: 'FORM-CHAIR', name: 'Form Task Chair', description: 'Ergonomic daily seating for focused work.', priceCents: 34900, onHand: 8, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'GRID-SHELF' }, update: { $setOnInsert: { sku: 'GRID-SHELF', name: 'Grid Storage Shelf', description: 'Modular shelving designed for adaptable spaces.', priceCents: 19900, onHand: 16, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'ARC-SHELF' }, update: { $setOnInsert: { sku: 'ARC-SHELF', name: 'Arc Corner Shelf', description: 'A rounded corner unit for awkward spaces.', priceCents: 18900, onHand: 6, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'NOVA-LAMP' }, update: { $setOnInsert: { sku: 'NOVA-LAMP', name: 'Nova Floor Lamp', description: 'Warm, dimmable light with a weighted base.', priceCents: 25900, onHand: 4, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'OAK-STOOL' }, update: { $setOnInsert: { sku: 'OAK-STOOL', name: 'Oak Step Stool', description: 'Solid oak with a non-slip top surface.', priceCents: 9900, onHand: 10, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'NEST-POUF' }, update: { $setOnInsert: { sku: 'NEST-POUF', name: 'Nest Storage Pouf', description: 'Soft seating with a hidden storage cavity.', priceCents: 7900, onHand: 14, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'DOCK-TRAY' }, update: { $setOnInsert: { sku: 'DOCK-TRAY', name: 'Dock Desk Tray', description: 'Keeps cables and daily tools within reach.', priceCents: 4900, onHand: 20, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'LOOM-RUG' }, update: { $setOnInsert: { sku: 'LOOM-RUG', name: 'Loom Wool Rug', description: 'Hand-loomed wool with a quiet, dense weave.', priceCents: 21900, onHand: 5, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'DRIFT-CLOCK' }, update: { $setOnInsert: { sku: 'DRIFT-CLOCK', name: 'Drift Wall Clock', description: 'A silent sweep movement in a slim frame.', priceCents: 6900, onHand: 9, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'PILOT-STAND' }, update: { $setOnInsert: { sku: 'PILOT-STAND', name: 'Pilot Monitor Stand', description: 'Raises a display while freeing desk space below.', priceCents: 11900, onHand: 7, reserved: 0, isActive: true } }, upsert: true } },
    { updateOne: { filter: { sku: 'FERN-PLANTER' }, update: { $setOnInsert: { sku: 'FERN-PLANTER', name: 'Fern Planter Set', description: 'Self-watering planters in three heights.', priceCents: 5400, onHand: 12, reserved: 0, isActive: true } }, upsert: true } }
  ]);
  logger.info({ adminEmail }, 'Seed data is ready');
  await disconnectDatabase();
}

seed().catch(async (error) => {
  logger.fatal({ err: error }, 'Seeding failed');
  await disconnectDatabase();
  process.exit(1);
});
