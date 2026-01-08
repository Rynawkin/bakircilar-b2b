import express from 'express';
import * as searchController from '../controllers/search.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Tüm route'lar için authentication gerekli
router.use(authenticate);

// Stok arama
router.get('/stocks', searchController.searchStocks);
router.get('/stocks/columns', searchController.getStockColumns);
router.get('/stocks/units', searchController.getStockUnits);
router.post('/stocks/by-codes', searchController.getStocksByCodes);

// Cari arama
router.get('/customers', searchController.searchCustomers);
router.get('/customers/columns', searchController.getCustomerColumns);

// Kullanıcı tercihleri
router.get('/preferences', searchController.getSearchPreferences);
router.put('/preferences', searchController.updateSearchPreferences);

export default router;
