import { logger } from '../config/logger.js';
import { expireDueReservations } from './reservationService.js';

export function startReservationExpiryWorker({ intervalMs = 30_000 } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const expired = await expireDueReservations();
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
