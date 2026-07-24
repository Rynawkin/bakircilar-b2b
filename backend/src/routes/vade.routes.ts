/**
 * Vade Tracking Routes (Admin)
 */

import { Router } from 'express';
import vadeController from '../controllers/vade.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requirePermission('admin:vade'));

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
    mikroCariCode: z.string().trim().min(1).max(80),
    customerName: z.string().trim().max(250).optional().nullable(),
    sectorCode: z.string().trim().max(100).optional().nullable(),
    groupCode: z.string().trim().max(100).optional().nullable(),
    regionCode: z.string().trim().max(100).optional().nullable(),
    pastDueBalance: z.number().finite().optional(),
    pastDueDate: z.string().date().optional().nullable(),
    notDueBalance: z.number().finite().optional(),
    notDueDate: z.string().date().optional().nullable(),
    totalBalance: z.number().finite().optional(),
    valor: z.number().finite().optional(),
    paymentTermLabel: z.string().trim().max(250).optional().nullable(),
    referenceDate: z.string().date().optional().nullable(),
    sourceRowNumber: z.number().int().positive().optional(),
  })).min(1),
  mode: z.enum(['PATCH', 'SNAPSHOT']).optional(),
  createMissingCustomers: z.boolean().optional(),
});

router.get('/balances', vadeController.getBalances);
router.get('/dashboard', vadeController.getDashboard);
router.get('/analytics', vadeController.getAnalytics);
router.get('/management', vadeController.getManagement);
router.get('/filters', vadeController.getFilters);
router.get('/customers/:id', vadeController.getCustomerDetail);
router.get('/notes', vadeController.getNotes);

router.post('/notes', validateBody(vadeNoteSchema), vadeController.createNote);
router.put('/notes/:id', validateBody(vadeNoteUpdateSchema), vadeController.updateNote);

router.post('/classification', validateBody(vadeClassificationSchema), vadeController.upsertClassification);

router.get('/assignments', vadeController.getAssignments);
router.post('/assignments', requirePermission('admin:vade'), validateBody(vadeAssignmentSchema), vadeController.assignCustomers);
router.delete('/assignments', requirePermission('admin:vade'), validateBody(vadeAssignmentRemoveSchema), vadeController.removeAssignment);

router.post('/import', requirePermission('admin:vade'), validateBody(vadeImportSchema), vadeController.importBalances);

router.post('/sync', requirePermission('admin:vade'), vadeController.triggerSync);
router.get('/sync/status/:id', requirePermission('admin:vade'), vadeController.getSyncStatus);

export default router;
