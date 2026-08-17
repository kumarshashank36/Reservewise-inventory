import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { expireDueReservations } from './reservationService.js';

// Drains due reservations in batches of EXPIRY_BATCH_SIZE, repeating until a
// tick finds less than a full batch, so a backlog releases stock within one
// tick instead of trickling out at one batch per 30 seconds. The per-tick
// ceiling bounds a pathological backlog without unbounded work.
const MAX_BATCHES_PER_TICK = 10;

export function startReservationExpiryWorker({ intervalMs = 30_000, batchSize = env.EXPIRY_BATCH_SIZE } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      let expired = 0;
      for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch += 1) {
        const released = await expireDueReservations({ limit: batchSize });
        expired += released;
        if (released < batchSize) break;
      }
      if (expired > 0) logger.info({ expired }, 'Expired reservations released');
    } catch (error) {
      logger.error({ err: error }, 'Reservation expiry worker failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
