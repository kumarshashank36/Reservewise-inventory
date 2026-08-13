import { Router } from 'express';
import { create, list, reactivate, remove } from '../controllers/userController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();
router.get('/admin/users', authenticate, authorize('admin'), list);
router.post('/admin/users', authenticate, authorize('admin'), create);
router.delete('/admin/users/:userId', authenticate, authorize('admin'), remove);
router.post('/admin/users/:userId/activate', authenticate, authorize('admin'), reactivate);
export default router;
