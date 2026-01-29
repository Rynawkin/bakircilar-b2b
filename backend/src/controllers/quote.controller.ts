/**
 * Quote Controller
 */

import { Request, Response, NextFunction } from 'express';
import quoteService from '../services/quote.service';
import { prisma } from '../utils/prisma';
import mikroService from '../services/mikroFactory.service';

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
      const quote = await quoteService.updateQuote(id, req.body, req.user!.userId);
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
      const { status } = req.query;
      const quotes = await quoteService.getQuotesForStaff(
        req.user!.userId,
        req.user!.role,
        status as string | undefined
      );
      res.json({ quotes });
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
      const quote = await quoteService.getQuoteByIdForStaff(id, { lastSalesCount });
      res.json({ quote });
    } catch (error) {
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
   * POST /api/admin/quotes/:id/approve
   */
  async approveQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { adminNote } = req.body || {};
      const quote = await quoteService.approveQuote(id, req.user!.userId, adminNote);
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
      const quote = await quoteService.rejectQuote(id, req.user!.userId, adminNote);
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
      const result = await quoteService.syncQuoteFromMikro(id);
      res.json(result);
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
        warehouseNo,
        invoicedSeries,
        invoicedSira,
        whiteSeries,
        whiteSira,
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
        warehouseNo,
        invoicedSeries,
        invoicedSira,
        whiteSeries,
        whiteSira,
        adminUserId: req.user!.userId,
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
      const quotes = await quoteService.getQuotesForCustomer(req.user!.userId);
      res.json({ quotes });
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
