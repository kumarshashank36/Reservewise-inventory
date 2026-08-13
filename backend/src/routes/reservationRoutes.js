import { Router } from 'express';
import { cancel, complete, create, getMine, listAdmin, listMine } from '../controllers/reservationController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();
router.get('/reservations', authenticate, authorize('customer'), listMine);
router.post('/reservations', authenticate, authorize('customer'), create);
router.get('/reservations/:reservationId', authenticate, authorize('customer'), getMine);
router.post('/reservations/:reservationId/cancel', authenticate, authorize('customer'), cancel);
router.post('/reservations/:reservationId/complete', authenticate, authorize('customer'), complete);
router.get('/admin/reservations', authenticate, authorize('admin'), listAdmin);
export default router;
