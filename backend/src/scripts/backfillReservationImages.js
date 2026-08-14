import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { assertRuntimeEnvironment, env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Product } from '../models/Product.js';
import { Reservation } from '../models/Reservation.js';

// One-off backfill: reservation items created before the imageUrl/category
// snapshot fields existed render letter tiles. Copy the current product's
// display fields into those items; items whose product is gone stay as-is
// (the UI's gradient fallback covers them).
async function backfill() {
  assertRuntimeEnvironment();
  await connectDatabase(env.MONGODB_URI);

  const stale = await Reservation.find({ 'items.imageUrl': { $exists: false } });
  let updatedItems = 0;
  for (const reservation of stale) {
    for (const item of reservation.items) {
      // Mongoose applies the schema default ('') on load, so emptiness is the marker.
      if (item.imageUrl) continue;
      const product = await Product.findById(item.productId);
      item.imageUrl = product?.imageUrl ?? '';
      item.category = product?.category ?? 'misc';
      updatedItems += 1;
    }
    await reservation.save();
  }

  logger.info({ reservations: stale.length, updatedItems }, 'Reservation image backfill complete');
  await disconnectDatabase();
}

backfill().catch(async (error) => {
  logger.fatal({ err: error }, 'Backfill failed');
  await disconnectDatabase();
  process.exit(1);
});
