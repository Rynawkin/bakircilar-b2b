/**
 * Vade Tracking Routes (Admin)
 */

import { Router } from 'express';
import vadeController from '../controllers/vade.controller';
import { authenticate, requireAdminOrManager, requireStaffOrDiversey } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireStaffOrDiversey);

const vadeNoteSchema = z.object({
  customerId: z.string().uuid(),
  noteContent: z.string().min(1),
  promiseDate: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  reminderDate: z.string().optional().nullable(),
  reminderNote: z.string().optional().nullable(),
  reminderCompleted: z.boolean().optional(),
  balanceAtTime: z.number().optional().nullable(),
});

const vadeNoteUpdateSchema = z.object({
  noteContent: z.string().min(1).optional(),
  promiseDate: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  reminderDate: z.string().optional().nullable(),
  reminderNote: z.string().optional().nullable(),
  reminderCompleted: z.boolean().optional(),
  balanceAtTime: z.number().optional().nullable(),
  reminderSentAt: z.string().optional().nullable(),
});

const vadeClassificationSchema = z.object({
  customerId: z.string().uuid(),
  classification: z.string().min(1),
  customClassification: z.string().optional().nullable(),
  riskScore: z.number().int().optional().nullable(),
});

const vadeAssignmentSchema = z.object({
  staffId: z.string().uuid(),
  customerIds: z.array(z.string().uuid()).min(1),
});

const vadeAssignmentRemoveSchema = z.object({
  staffId: z.string().uuid(),
  customerId: z.string().uuid(),
});

const vadeImportSchema = z.object({
  rows: z.array(z.object({
    mikroCariCode: z.string().min(1),
    pastDueBalance: z.number().optional(),
    pastDueDate: z.string().optional().nullable(),
    notDueBalance: z.number().optional(),
    notDueDate: z.string().optional().nullable(),
    totalBalance: z.number().optional(),
    valor: z.number().optional(),
    paymentTermLabel: z.string().optional().nullable(),
    referenceDate: z.string().optional().nullable(),
  })).min(1),
});

router.get('/balances', vadeController.getBalances);
router.get('/filters', vadeController.getFilters);
router.get('/customers/:id', vadeController.getCustomerDetail);
router.get('/notes', vadeController.getNotes);

router.post('/notes', validateBody(vadeNoteSchema), vadeController.createNote);
router.put('/notes/:id', validateBody(vadeNoteUpdateSchema), vadeController.updateNote);

router.post('/classification', validateBody(vadeClassificationSchema), vadeController.upsertClassification);

router.get('/assignments', vadeController.getAssignments);
router.post('/assignments', requireAdminOrManager, validateBody(vadeAssignmentSchema), vadeController.assignCustomers);
router.delete('/assignments', requireAdminOrManager, validateBody(vadeAssignmentRemoveSchema), vadeController.removeAssignment);

router.post('/import', requireAdminOrManager, validateBody(vadeImportSchema), vadeController.importBalances);

router.post('/sync', requireAdminOrManager, vadeController.triggerSync);
router.get('/sync/status/:id', requireAdminOrManager, vadeController.getSyncStatus);

export default router;
