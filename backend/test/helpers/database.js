import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { Product } from '../../src/models/Product.js';
import { Reservation } from '../../src/models/Reservation.js';
import { User } from '../../src/models/User.js';

let replSet;

export async function startTestDatabase() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDatabase(replSet.getUri());
}

export async function clearTestDatabase() {
  await Promise.all([User.deleteMany({}), Product.deleteMany({}), Reservation.deleteMany({})]);
}

export async function stopTestDatabase() {
  await disconnectDatabase();
  await replSet.stop();
}
