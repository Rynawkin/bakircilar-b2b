/**
 * Raporlar Routes
 *
 * Admin raporları için route tanımları
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import {
  getCostUpdateAlerts,
  getReportCategories,
} from '../controllers/reports.controller';

const router = Router();

// Tüm raporlar admin yetkisi gerektirir
router.use(authenticate, requireAdmin);

/**
 * Maliyet Güncelleme Uyarıları Raporu
 * GET /api/admin/reports/cost-update-alerts
 */
router.get('/cost-update-alerts', getCostUpdateAlerts);

/**
 * Kategori Listesi (Filtreleme için)
 * GET /api/admin/reports/categories
 */
router.get('/categories', getReportCategories);

export default router;
