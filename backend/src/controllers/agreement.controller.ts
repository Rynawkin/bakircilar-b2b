/**
 * Customer Price Agreements Controller (Admin)
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { splitSearchTokens } from '../utils/search';

export class AgreementController {
  /**
   * GET /api/admin/agreements?customerId=...
   */
  async getAgreements(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, search } = req.query;
      if (!customerId || typeof customerId !== 'string') {
        return res.status(400).json({ error: 'customerId is required' });
      }

      const tokens = splitSearchTokens(search as string | undefined);
      const where: any = { customerId };

      if (tokens.length > 0) {
        where.AND = tokens.map((token) => ({
          OR: [
            { product: { name: { contains: token, mode: 'insensitive' } } },
            { product: { mikroCode: { contains: token, mode: 'insensitive' } } },
          ],
        }));
      }

      const agreements = await prisma.customerPriceAgreement.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              mikroCode: true,
              unit: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      res.json({ agreements });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/agreements
   */
  async upsertAgreement(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        customerId,
        productId,
        priceInvoiced,
        priceWhite,
        minQuantity,
        validFrom,
        validTo,
      } = req.body || {};

      if (!customerId || !productId) {
        return res.status(400).json({ error: 'customerId and productId are required' });
      }

      const priceInvoicedNumber = Number(priceInvoiced);
      const priceWhiteNumber = Number(priceWhite);
      if (!Number.isFinite(priceInvoicedNumber) || priceInvoicedNumber <= 0) {
        return res.status(400).json({ error: 'priceInvoiced must be greater than 0' });
      }
      if (!Number.isFinite(priceWhiteNumber) || priceWhiteNumber <= 0) {
        return res.status(400).json({ error: 'priceWhite must be greater than 0' });
      }

      const minQuantityNumber = Number(minQuantity) || 1;
      if (!Number.isFinite(minQuantityNumber) || minQuantityNumber <= 0) {
        return res.status(400).json({ error: 'minQuantity must be greater than 0' });
      }

      const validFromDate = validFrom ? new Date(validFrom) : new Date();
      if (Number.isNaN(validFromDate.getTime())) {
        return res.status(400).json({ error: 'validFrom is invalid' });
      }

      const validToDate = validTo ? new Date(validTo) : null;
      if (validTo && (!validToDate || Number.isNaN(validToDate.getTime()))) {
        return res.status(400).json({ error: 'validTo is invalid' });
      }
      if (validToDate && validToDate < validFromDate) {
        return res.status(400).json({ error: 'validTo must be after validFrom' });
      }

      const data = {
        customerId,
        productId,
        priceInvoiced: priceInvoicedNumber,
        priceWhite: priceWhiteNumber,
        minQuantity: minQuantityNumber,
        validFrom: validFromDate,
        validTo: validToDate,
      };

      const agreement = await prisma.customerPriceAgreement.upsert({
        where: {
          customerId_productId: {
            customerId,
            productId,
          },
        },
        create: data,
        update: data,
      });

      res.json({ agreement });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/agreements/:id
   */
  async deleteAgreement(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await prisma.customerPriceAgreement.delete({ where: { id } });
      res.json({ message: 'Agreement deleted' });
    } catch (error) {
      next(error);
    }
  }
}

export default new AgreementController();
