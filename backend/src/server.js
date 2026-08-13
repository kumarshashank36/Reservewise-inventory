import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { assertRuntimeEnvironment, env } from './config/env.js';
import { logger } from './config/logger.js';
import { startReservationExpiryWorker } from './services/reservationExpiryWorker.js';

async function start() {
  assertRuntimeEnvironment();
  await connectDatabase(env.MONGODB_URI);
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));
  const stopExpiryWorker = startReservationExpiryWorker();

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down API');
    server.close(async () => {
      stopExpiryWorker();
      const { disconnectDatabase } = await import('./config/database.js');
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start API');
  process.exit(1);
});
