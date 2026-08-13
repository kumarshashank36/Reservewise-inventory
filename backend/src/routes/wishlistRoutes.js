import { Router } from 'express';
import { add, list, remove } from '../controllers/wishlistController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();
router.get('/wishlist', authenticate, authorize('customer'), list);
router.post('/wishlist', authenticate, authorize('customer'), add);
router.delete('/wishlist/:productId', authenticate, authorize('customer'), remove);
export default router;
