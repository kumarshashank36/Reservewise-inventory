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
  // Thirty products across five categories, so the catalog is browsable by category
  // and paginated out of the box. $set backfills the category on existing documents.
  await Product.bulkWrite([
    { updateOne: { filter: { sku: 'LUMEN-DESK' }, update: { $setOnInsert: { sku: 'LUMEN-DESK', name: 'Lumen Desk Lamp', description: 'A focused LED task light with an adjustable arm.', priceCents: 12900, onHand: 12, reserved: 0, isActive: true }, $set: { category: 'home' } }, upsert: true } },
    { updateOne: { filter: { sku: 'FORM-CHAIR' }, update: { $setOnInsert: { sku: 'FORM-CHAIR', name: 'Form Task Chair', description: 'Ergonomic daily seating for focused work.', priceCents: 34900, onHand: 8, reserved: 0, isActive: true }, $set: { category: 'furniture' } }, upsert: true } },
    { updateOne: { filter: { sku: 'GRID-SHELF' }, update: { $setOnInsert: { sku: 'GRID-SHELF', name: 'Grid Storage Shelf', description: 'Modular shelving designed for adaptable spaces.', priceCents: 19900, onHand: 16, reserved: 0, isActive: true }, $set: { category: 'furniture' } }, upsert: true } },
    { updateOne: { filter: { sku: 'ARC-SHELF' }, update: { $setOnInsert: { sku: 'ARC-SHELF', name: 'Arc Corner Shelf', description: 'A rounded corner unit for awkward spaces.', priceCents: 18900, onHand: 6, reserved: 0, isActive: true }, $set: { category: 'furniture' } }, upsert: true } },
    { updateOne: { filter: { sku: 'NOVA-LAMP' }, update: { $setOnInsert: { sku: 'NOVA-LAMP', name: 'Nova Floor Lamp', description: 'Warm, dimmable light with a weighted base.', priceCents: 25900, onHand: 4, reserved: 0, isActive: true }, $set: { category: 'home' } }, upsert: true } },
    { updateOne: { filter: { sku: 'OAK-STOOL' }, update: { $setOnInsert: { sku: 'OAK-STOOL', name: 'Oak Step Stool', description: 'Solid oak with a non-slip top surface.', priceCents: 9900, onHand: 10, reserved: 0, isActive: true }, $set: { category: 'furniture' } }, upsert: true } },
    { updateOne: { filter: { sku: 'NEST-POUF' }, update: { $setOnInsert: { sku: 'NEST-POUF', name: 'Nest Storage Pouf', description: 'Soft seating with a hidden storage cavity.', priceCents: 7900, onHand: 14, reserved: 0, isActive: true }, $set: { category: 'furniture' } }, upsert: true } },
    { updateOne: { filter: { sku: 'DOCK-TRAY' }, update: { $setOnInsert: { sku: 'DOCK-TRAY', name: 'Dock Desk Tray', description: 'Keeps cables and daily tools within reach.', priceCents: 4900, onHand: 20, reserved: 0, isActive: true }, $set: { category: 'stationery' } }, upsert: true } },
    { updateOne: { filter: { sku: 'LOOM-RUG' }, update: { $setOnInsert: { sku: 'LOOM-RUG', name: 'Loom Wool Rug', description: 'Hand-loomed wool with a quiet, dense weave.', priceCents: 21900, onHand: 5, reserved: 0, isActive: true }, $set: { category: 'home' } }, upsert: true } },
    { updateOne: { filter: { sku: 'DRIFT-CLOCK' }, update: { $setOnInsert: { sku: 'DRIFT-CLOCK', name: 'Drift Wall Clock', description: 'A silent sweep movement in a slim frame.', priceCents: 6900, onHand: 9, reserved: 0, isActive: true }, $set: { category: 'home' } }, upsert: true } },
    { updateOne: { filter: { sku: 'PILOT-STAND' }, update: { $setOnInsert: { sku: 'PILOT-STAND', name: 'Pilot Monitor Stand', description: 'Raises a display while freeing desk space below.', priceCents: 11900, onHand: 7, reserved: 0, isActive: true }, $set: { category: 'furniture' } }, upsert: true } },
    { updateOne: { filter: { sku: 'FERN-PLANTER' }, update: { $setOnInsert: { sku: 'FERN-PLANTER', name: 'Fern Planter Set', description: 'Self-watering planters in three heights.', priceCents: 5400, onHand: 12, reserved: 0, isActive: true }, $set: { category: 'home' } }, upsert: true } },
    { updateOne: { filter: { sku: 'PULSE-EARBUDS' }, update: { $setOnInsert: { sku: 'PULSE-EARBUDS', name: 'Pulse Wireless Earbuds', description: 'Compact earbuds with adaptive noise cancelling.', priceCents: 8900, onHand: 18, reserved: 0, isActive: true }, $set: { category: 'electronics' } }, upsert: true } },
    { updateOne: { filter: { sku: 'BEAM-SPEAKER' }, update: { $setOnInsert: { sku: 'BEAM-SPEAKER', name: 'Beam Bluetooth Speaker', description: 'Room-filling sound in a portable shell.', priceCents: 12900, onHand: 10, reserved: 0, isActive: true }, $set: { category: 'electronics' } }, upsert: true } },
    { updateOne: { filter: { sku: 'VOLT-CHARGER' }, update: { $setOnInsert: { sku: 'VOLT-CHARGER', name: 'Volt 65W GaN Charger', description: 'Fast charging for laptops, phones, and tablets.', priceCents: 4900, onHand: 25, reserved: 0, isActive: true }, $set: { category: 'electronics' } }, upsert: true } },
    { updateOne: { filter: { sku: 'HUE-DISPLAY' }, update: { $setOnInsert: { sku: 'HUE-DISPLAY', name: 'Hue 27" 4K Display', description: 'A colour-accurate panel for long workdays.', priceCents: 42900, onHand: 5, reserved: 0, isActive: true }, $set: { category: 'electronics' } }, upsert: true } },
    { updateOne: { filter: { sku: 'TACTILE-KEYBOARD' }, update: { $setOnInsert: { sku: 'TACTILE-KEYBOARD', name: 'Tactile Mechanical Keyboard', description: 'Hot-swappable switches with a soft thock.', priceCents: 11900, onHand: 9, reserved: 0, isActive: true }, $set: { category: 'electronics' } }, upsert: true } },
    { updateOne: { filter: { sku: 'DRIFT-MOUSE' }, update: { $setOnInsert: { sku: 'DRIFT-MOUSE', name: 'Drift Ergonomic Mouse', description: 'A vertical grip that keeps the wrist neutral.', priceCents: 5900, onHand: 14, reserved: 0, isActive: true }, $set: { category: 'electronics' } }, upsert: true } },
    { updateOne: { filter: { sku: 'MERINO-TEE' }, update: { $setOnInsert: { sku: 'MERINO-TEE', name: 'Merino Everyday Tee', description: 'Breathable merino for all-day comfort.', priceCents: 4500, onHand: 30, reserved: 0, isActive: true }, $set: { category: 'clothing' } }, upsert: true } },
    { updateOne: { filter: { sku: 'SLATE-JACKET' }, update: { $setOnInsert: { sku: 'SLATE-JACKET', name: 'Slate Field Jacket', description: 'Water-resistant shell with a clean drape.', priceCents: 14900, onHand: 8, reserved: 0, isActive: true }, $set: { category: 'clothing' } }, upsert: true } },
    { updateOne: { filter: { sku: 'LINEN-SHIRT' }, update: { $setOnInsert: { sku: 'LINEN-SHIRT', name: 'Linen Work Shirt', description: 'Washed linen that breathes in warm rooms.', priceCents: 7900, onHand: 12, reserved: 0, isActive: true }, $set: { category: 'clothing' } }, upsert: true } },
    { updateOne: { filter: { sku: 'TRAIL-PANTS' }, update: { $setOnInsert: { sku: 'TRAIL-PANTS', name: 'Trail Utility Pants', description: 'Stretch fabric with six practical pockets.', priceCents: 8900, onHand: 11, reserved: 0, isActive: true }, $set: { category: 'clothing' } }, upsert: true } },
    { updateOne: { filter: { sku: 'WOOL-BEANIE' }, update: { $setOnInsert: { sku: 'WOOL-BEANIE', name: 'Wool Rib Beanie', description: 'A snug ribbed knit for colder commutes.', priceCents: 2900, onHand: 20, reserved: 0, isActive: true }, $set: { category: 'clothing' } }, upsert: true } },
    { updateOne: { filter: { sku: 'MOTION-SOCKS' }, update: { $setOnInsert: { sku: 'MOTION-SOCKS', name: 'Motion Running Socks', description: 'Cushioned pairs that stay in place.', priceCents: 1900, onHand: 40, reserved: 0, isActive: true }, $set: { category: 'clothing' } }, upsert: true } },
    { updateOne: { filter: { sku: 'ARCHIVE-NOTEBOOK' }, update: { $setOnInsert: { sku: 'ARCHIVE-NOTEBOOK', name: 'Archive Dot Notebook', description: 'Lay-flat dot grid with numbered pages.', priceCents: 2400, onHand: 35, reserved: 0, isActive: true }, $set: { category: 'stationery' } }, upsert: true } },
    { updateOne: { filter: { sku: 'INK-SET' }, update: { $setOnInsert: { sku: 'INK-SET', name: 'Ink Fountain Pen Set', description: 'A fine nib with six archival inks.', priceCents: 6900, onHand: 7, reserved: 0, isActive: true }, $set: { category: 'stationery' } }, upsert: true } },
    { updateOne: { filter: { sku: 'PAPER-REAMS' }, update: { $setOnInsert: { sku: 'PAPER-REAMS', name: 'Paper Reams A4 Pack', description: 'Five reams of smooth 90gsm paper.', priceCents: 3200, onHand: 22, reserved: 0, isActive: true }, $set: { category: 'stationery' } }, upsert: true } },
    { updateOne: { filter: { sku: 'FELT-PENS' }, update: { $setOnInsert: { sku: 'FELT-PENS', name: 'Felt Tip Pen Assortment', description: 'Twenty-four colours that never bleed.', priceCents: 2900, onHand: 18, reserved: 0, isActive: true }, $set: { category: 'stationery' } }, upsert: true } },
    { updateOne: { filter: { sku: 'BOARD-CORK' }, update: { $setOnInsert: { sku: 'BOARD-CORK', name: 'Cork Pin Board', description: 'A self-healing cork surface for ideas.', priceCents: 5400, onHand: 9, reserved: 0, isActive: true }, $set: { category: 'stationery' } }, upsert: true } },
    { updateOne: { filter: { sku: 'PLANNER-DAILY' }, update: { $setOnInsert: { sku: 'PLANNER-DAILY', name: 'Daily Planner 2026', description: 'Undated daily pages with weekly reviews.', priceCents: 3600, onHand: 15, reserved: 0, isActive: true }, $set: { category: 'stationery' } }, upsert: true } }
  ]);
  logger.info({ adminEmail }, 'Seed data is ready');
  await disconnectDatabase();
}

seed().catch(async (error) => {
  logger.fatal({ err: error }, 'Seeding failed');
  await disconnectDatabase();
  process.exit(1);
});
