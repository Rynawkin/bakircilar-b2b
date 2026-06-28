import express from 'express';
import * as searchController from '../controllers/search.controller';
import { authenticate, requireNotCustomer } from '../middleware/auth.middleware';

const router = express.Router();

// Tüm route'lar için authentication gerekli
router.use(authenticate);
// 11.1: Cari/stok arama hassas veri (maliyet, bakiye, telefon, vergi no) dondurdugu icin
// musteri rolu erisemez; sadece personel rolleri.
router.use(requireNotCustomer);

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
