/**
 * AI Assistant Routes  (/admin/ai)
 *
 * Sirket-ici AI asistani: dogal dil soru-cevap + teklif analizi.
 * Erisim: authenticate + admin:ai-assistant izni (HEAD_ADMIN/ADMIN/MANAGER/SALES_REP varsayilan).
 */

import { Router } from 'express';
import aiAssistantController from '../controllers/ai-assistant.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { trackStaffApiActivity } from '../middleware/staff-activity.middleware';

const router = Router();

router.use(authenticate);
router.use(trackStaffApiActivity);
router.use(requirePermission('admin:ai-assistant'));

router.get('/status', (req, res) => aiAssistantController.status(req, res));
router.post('/chat', (req, res) => aiAssistantController.chat(req, res));
router.post('/analyze-quote', (req, res) => aiAssistantController.analyzeQuote(req, res));

export default router;
