import { Router } from 'express';
import { create, listAdmin, listCatalog, update } from '../controllers/productController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();
router.get('/products', authenticate, listCatalog);
router.get('/admin/products', authenticate, authorize('admin'), listAdmin);
router.post('/admin/products', authenticate, authorize('admin'), create);
router.patch('/admin/products/:productId', authenticate, authorize('admin'), update);
export default router;
