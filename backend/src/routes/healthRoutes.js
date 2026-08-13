import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(200).json({
    status: 'ok',
    service: 'inventory-reservation-api',
    database: databaseConnected ? 'connected' : 'not-connected'
  });
});

export default router;
