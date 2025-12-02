/**
 * Raporlar Routes
 *
 * Admin raporları için route tanımları
 */

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import {
  getCostUpdateAlerts,
  getReportCategories,
} from '../controllers/reports.controller';

const router = Router();

// Tüm raporlar admin yetkisi gerektirir
router.use(authenticateToken, requireAdmin);

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
