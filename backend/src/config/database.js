import mongoose from 'mongoose';
import { logger } from './logger.js';

export async function connectDatabase(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info({ database: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
