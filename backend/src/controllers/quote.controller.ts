/**
 * Quote Controller
 */

import { Request, Response, NextFunction } from 'express';
import quoteService from '../services/quote.service';
import { prisma } from '../utils/prisma';
import mikroService from '../services/mikroFactory.service';
import { AppError, ErrorCode } from '../types/errors';
import auditLogService from '../services/audit-log.service';

const ensureQuoteSectorAccess = async (req: Request, quoteId: string) => {
  if (req.user?.role !== 'SALES_REP') return;

  const assignedSectorCodes = req.user?.assignedSectorCodes || [];
  if (assignedSectorCodes.length === 0) {
    throw new AppError('You can only access quotes from customers in your assigned sectors', 403, ErrorCode.FORBIDDEN);
  }

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: { select: { sectorCode: true } },
    },
  });

  if (!quote) {
    throw new AppError('Quote not found', 404, ErrorCode.NOT_FOUND);
  }

  const sectorCode = quote.customer?.sectorCode || '';
  if (!sectorCode || !assignedSectorCodes.includes(sectorCode)) {
    throw new AppError('You can only access quotes from customers in your assigned sectors', 403, ErrorCode.FORBIDDEN);
  }
};

export class QuoteController {
  /**
   * GET /api/admin/quotes/preferences
   */
  async getPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const preferences = await quoteService.getPreferences(req.user!.userId);
      res.json({ preferences });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/quotes/preferences
   */
  async updatePreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        lastSalesCount,
        whatsappTemplate,
        responsibleCode,
        columnWidths,
        poolSort,
        poolPriceListNo,
        poolColorRules,
      } = req.body || {};
      const preferences = await quoteService.updatePreferences(req.user!.userId, {
        lastSalesCount,
        whatsappTemplate,
        responsibleCode,
        columnWidths,
        poolSort,
        poolPriceListNo,
        poolColorRules,
      });
      res.json({ preferences });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/quotes/customer/:customerId/purchased-products
   */
  async getCustomerPurchasedProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId } = req.params;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const fallback = await quoteService.getPreferences(req.user!.userId);
      const lastSalesCount = limitParam || fallback.lastSalesCount || 1;

      const result = await quoteService.getCustomerPurchasedProducts(customerId, lastSalesCount);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/quotes/responsibles
   */
  async getResponsibles(req: Request, res: Response, next: NextFunction) {
    try {
      const responsibles = await mikroService.getCariPersonelList();
      res.json({ responsibles });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes
   */
  async createQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const quote = await quoteService.createQuote(req.body, req.user!.userId);
      await auditLogService.fromRequest(req, {
        action: 'QUOTE_CREATE',
        entityType: 'Quote',
        entityId: quote.id,
        entityCode: quote.quoteNumber || null,
        summary: `Teklif olusturuldu: ${quote.quoteNumber || quote.id}`,
        after: { id: quote.id, quoteNumber: quote.quoteNumber, customerId: quote.customerId, status: quote.status },
      });
      res.status(201).json({ quote });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/quotes/:id
   */
  async updateQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await ensureQuoteSectorAccess(req, id);
      const quote = await quoteService.updateQuote(id, req.body, req.user!.userId);
      await auditLogService.fromRequest(req, {
        action: 'QUOTE_UPDATE',
        entityType: 'Quote',
        entityId: quote.id,
        entityCode: quote.quoteNumber || null,
        summary: `Teklif guncellendi: ${quote.quoteNumber || quote.id}`,
        metadata: { changedFields: Object.keys(req.body || {}) },
      });
      res.json({ quote });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/quotes
   */
  async getQuotes(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        status,
        search,
        sectorCode,
        createdById,
        categoryId,
        brandCode,
        dateFrom,
        dateTo,
        page,
        pageSize,
      } = req.query;
      const result = await quoteService.getQuotesForStaff(
        req.user!.userId,
        req.user!.role,
        status as string | undefined,
        req.user!.assignedSectorCodes || [],
        {
          search: typeof search === 'string' ? search : undefined,
          sectorCode: typeof sectorCode === 'string' ? sectorCode : undefined,
          createdById: typeof createdById === 'string' ? createdById : undefined,
          categoryId: typeof categoryId === 'string' ? categoryId : undefined,
          brandCode: typeof brandCode === 'string' ? brandCode : undefined,
          dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
          dateTo: typeof dateTo === 'string' ? dateTo : undefined,
          page: page !== undefined ? Number(page) : undefined,
          pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
        }
      );
      // Geriye-uyumlu: pageSize verilmezse eski {quotes} sekli; verilirse pagination eklenir
      if (result.paginated) {
        res.json({
          quotes: result.quotes,
          pagination: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
          },
        });
      } else {
        res.json({ quotes: result.quotes });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/quotes/filter-options
   */
  async getQuoteFilterOptions(req: Request, res: Response, next: NextFunction) {
    try {
      const options = await quoteService.getQuoteFilterOptions(
        req.user!.role,
        req.user!.assignedSectorCodes || [],
      );
      res.json(options);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/quotes/:id
   */
  async getQuoteById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const preferences = await quoteService.getPreferences(req.user!.userId);
      const lastSalesCount = Math.max(1, Number(preferences.lastSalesCount) || 1);
      const quote = await quoteService.getQuoteByIdForStaff(id, {
        lastSalesCount,
        role: req.user!.role,
        assignedSectorCodes: req.user!.assignedSectorCodes || [],
      });
      res.json({ quote });
    } catch (error: any) {
      if (error?.message === 'QUOTE_FORBIDDEN') {
        return res.status(403).json({ error: 'You can only access quotes from customers in your assigned sectors' });
      }
      next(error);
    }
  }

  /**
   * GET /api/admin/quotes/:id/history
   */
  async getQuoteHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const history = await quoteService.getQuoteHistory(id);
      res.json({ history });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/quotes/line-items
   */
  async getQuoteLineItems(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        status,
        search,
        closeReason,
        minDays,
        maxDays,
        limit,
        offset,
      } = req.query;

      const parseNumber = (value: any) => {
        if (value === undefined || value === null || value === '') return undefined;
        const parsed = parseInt(String(value), 10);
        return Number.isFinite(parsed) ? parsed : undefined;
      };

      const sectorCodes = req.user?.role === 'SALES_REP' ? (req.user.assignedSectorCodes || []) : undefined;

      const result = await quoteService.getQuoteLineItems({
        status: status ? String(status) : undefined,
        search: search ? String(search) : undefined,
        closeReason: closeReason ? String(closeReason) : undefined,
        minDays: parseNumber(minDays),
        maxDays: parseNumber(maxDays),
        limit: parseNumber(limit),
        offset: parseNumber(offset),
        sectorCodes,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/line-items/close
   */
  async closeQuoteItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items are required' });
      }

      const result = await quoteService.closeQuoteItems({
        items,
        adminUserId: req.user!.userId,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/line-items/reopen
   */
  async reopenQuoteItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemIds } = req.body || {};
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'Item ids are required' });
      }

      const result = await quoteService.reopenQuoteItems({
        itemIds,
        adminUserId: req.user!.userId,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/last-quotes
   */
  async getLastQuotesForCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, productCodes, limit, excludeQuoteId } = req.body || {};
      if (!customerId || !Array.isArray(productCodes) || productCodes.length === 0) {
        return res.json({ lastQuotes: {} });
      }
      const normalizedCodes = productCodes.map((code: any) => String(code)).filter(Boolean);
      const safeLimit = Math.max(1, Math.min(10, Number(limit) || 1));
      const lastQuotes = await quoteService.getCustomerLastQuoteItems(
        customerId,
        normalizedCodes,
        safeLimit,
        excludeQuoteId
      );
      res.json({ lastQuotes });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/category-last-purchases
   */
  async getCategoryLastPurchasesForCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, productCodes } = req.body || {};
      if (!customerId || !Array.isArray(productCodes) || productCodes.length === 0) {
        return res.json({ categoryLastPurchases: {} });
      }
      const normalizedCodes = productCodes.map((code: any) => String(code)).filter(Boolean);
      const categoryLastPurchases = await quoteService.getCustomerCategoryLastPurchasesForProducts(
        customerId,
        normalizedCodes,
      );
      res.json({ categoryLastPurchases });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/items/upload-image
   */
  async uploadQuoteItemImage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/quote-items/${req.file.filename}`;
      res.json({ imageUrl, message: 'Gorsel yuklendi' });
    } catch (error) {
      next(error);
    }
  }


  /**
   * POST /api/admin/quotes/:id/approve
   */
  async approveQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { adminNote } = req.body || {};
      await ensureQuoteSectorAccess(req, id);
      const quote = await quoteService.approveQuote(id, req.user!.userId, adminNote);
      await auditLogService.fromRequest(req, {
        action: 'QUOTE_APPROVE',
        entityType: 'Quote',
        entityId: quote.id,
        entityCode: quote.quoteNumber || null,
        summary: `Teklif onaylandi: ${quote.quoteNumber || quote.id}`,
        metadata: { adminNote: adminNote || null },
      });
      res.json({ quote });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/:id/reject
   */
  async rejectQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { adminNote } = req.body || {};
      if (!adminNote || !adminNote.trim()) {
        return res.status(400).json({ error: 'Admin note is required' });
      }
      await ensureQuoteSectorAccess(req, id);
      const quote = await quoteService.rejectQuote(id, req.user!.userId, adminNote);
      await auditLogService.fromRequest(req, {
        action: 'QUOTE_REJECT',
        entityType: 'Quote',
        entityId: quote.id,
        entityCode: quote.quoteNumber || null,
        summary: `Teklif reddedildi: ${quote.quoteNumber || quote.id}`,
        metadata: { adminNote },
      });
      res.json({ quote });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/:id/sync
   */
  async syncQuoteFromMikro(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await ensureQuoteSectorAccess(req, id);
      const result = await quoteService.syncQuoteFromMikro(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/:id/customer-pdf-sent
   */
  async markCustomerPdfSent(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await ensureQuoteSectorAccess(req, id);
      const quote = await quoteService.markCustomerPdfSent(id, req.user!.userId);
      res.json({ quote });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/quotes/:id/convert-to-order
   */
  async convertQuoteToOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        selectedItemIds,
        closeReasons,
        closeUnselected,
        warehouseNo,
        invoicedSeries,
        invoicedSira,
        whiteSeries,
        whiteSira,
        itemUpdates,
        documentNo,
        documentDescription,
      } = req.body || {};

      if (!Array.isArray(selectedItemIds) || selectedItemIds.length === 0) {
        return res.status(400).json({ error: 'Selected items are required' });
      }

      if (req.user?.role === 'SALES_REP') {
        const quote = await prisma.quote.findUnique({
          where: { id },
          include: {
            customer: { select: { sectorCode: true } },
          },
        });

        if (!quote) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const sectorCode = quote.customer?.sectorCode;
        const allowed = sectorCode && (req.user?.assignedSectorCodes || []).includes(sectorCode);
        if (!allowed) {
          return res.status(403).json({ error: 'You can only convert quotes from your sectors' });
        }
      }

      const result = await quoteService.convertQuoteToOrder(id, {
        selectedItemIds,
        closeReasons,
        closeUnselected,
        warehouseNo,
        invoicedSeries,
        invoicedSira,
        whiteSeries,
        whiteSira,
        itemUpdates,
        adminUserId: req.user!.userId,
        documentNo,
        documentDescription,
      });

      await auditLogService.fromRequest(req, {
        action: 'QUOTE_CONVERT_TO_ORDER',
        entityType: 'Quote',
        entityId: id,
        summary: `Teklif siparise cevrildi: ${id}`,
        metadata: {
          selectedItemCount: selectedItemIds.length,
          orderId: (result as any)?.order?.id || (result as any)?.orderId || null,
        },
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/quotes
   */
  async getCustomerQuotes(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, search, page, pageSize } = req.query;
      const result = await quoteService.getQuotesForCustomer(req.user!.userId, {
        status: typeof status === 'string' ? status : undefined,
        search: typeof search === 'string' ? search : undefined,
        page: page !== undefined ? Number(page) : undefined,
        pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
      });
      if (Array.isArray(result)) {
        res.json({ quotes: result });
      } else {
        res.json({
          quotes: result.quotes,
          pagination: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/quotes/:id
   */
  async getCustomerQuoteById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const quote = await quoteService.getQuoteByIdForCustomer(req.user!.userId, id);
      res.json({ quote });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/quotes/:id/accept
   */
  async acceptQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const quote = await quoteService.respondToQuote(id, req.user!.userId, 'accept');
      res.json({ quote });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/quotes/:id/reject
   */
  async rejectCustomerQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const quote = await quoteService.respondToQuote(id, req.user!.userId, 'reject');
      res.json({ quote });
    } catch (error) {
      next(error);
    }
  }
}

export default new QuoteController();
