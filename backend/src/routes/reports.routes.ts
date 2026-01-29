/**
 * Raporlar Routes
 *
 * Admin raporları için route tanımları
 */

import { Router } from 'express';
import { authenticate, requirePermission, requireAnyPermission } from '../middleware/auth.middleware';
import {
  getCostUpdateAlerts,
  getReportCategories,
} from '../controllers/reports.controller';

const router = Router();

// Tüm raporlar admin yetkisi gerektirir
router.use(authenticate);


/**
 * Maliyet Güncelleme Uyarıları Raporu
 * GET /api/admin/reports/cost-update-alerts
 */
router.get('/cost-update-alerts', requirePermission('reports:cost-update-alerts'), getCostUpdateAlerts);

/**
 * Kategori Listesi (Filtreleme için)
 * GET /api/admin/reports/categories
 */
router.get('/categories', requireAnyPermission(['reports:profit-analysis', 'reports:margin-compliance', 'reports:price-history', 'reports:cost-update-alerts', 'reports:top-products', 'reports:top-customers', 'reports:supplier-price-lists']), getReportCategories);

export default router;
