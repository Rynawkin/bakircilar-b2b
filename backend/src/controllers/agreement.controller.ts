/**
 * Customer Price Agreements Controller (Admin)
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { splitSearchTokens } from '../utils/search';

const parseNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let str = String(value).trim();
  if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d+$/.test(str)) {
    str = str.replace(',', '.');
  } else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(str)) {
    str = str.replace(/,/g, '');
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDateValue = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length === 3) {
    const [day, month, year] = parts.map((part) => Number(part));
    if (day && month && year) {
      const date = new Date(Date.UTC(year, month - 1, day));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

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
        customerProductCode,
        minQuantity,
        validFrom,
        validTo,
      } = req.body || {};

      if (!customerId || !productId) {
        return res.status(400).json({ error: 'customerId and productId are required' });
      }

      const priceInvoicedNumber = Number(priceInvoiced);
      const priceWhiteNumber =
        priceWhite === null || priceWhite === undefined || priceWhite === ''
          ? null
          : Number(priceWhite);
      if (!Number.isFinite(priceInvoicedNumber) || priceInvoicedNumber <= 0) {
        return res.status(400).json({ error: 'priceInvoiced must be greater than 0' });
      }
      if (priceWhiteNumber !== null && (!Number.isFinite(priceWhiteNumber) || priceWhiteNumber <= 0)) {
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
        customerProductCode: customerProductCode ? String(customerProductCode).trim() : null,
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

  /**
   * POST /api/admin/agreements/bulk-delete
   */
  async bulkDeleteAgreements(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, ids } = req.body || {};
      if (!customerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }

      const where: any = { customerId };
      if (Array.isArray(ids) && ids.length > 0) {
        where.id = { in: ids };
      }

      const result = await prisma.customerPriceAgreement.deleteMany({ where });
      res.json({ deletedCount: result.count });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/agreements/import
   */
  async importAgreements(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, rows } = req.body || {};
      if (!customerId || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'customerId and rows are required' });
      }

      const customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: { id: true, role: true },
      });

      if (!customer || customer.role !== 'CUSTOMER') {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const codes = rows
        .map((row: any) => String(row?.mikroCode || '').trim())
        .filter(Boolean);
      const uniqueCodes = Array.from(new Set(codes));

      if (uniqueCodes.length === 0) {
        return res.status(400).json({ error: 'No valid mikro codes provided' });
      }

      const products = await prisma.product.findMany({
        where: { mikroCode: { in: uniqueCodes } },
        select: { id: true, mikroCode: true, name: true },
      });
      const productMap = new Map(products.map((product) => [product.mikroCode, product]));

      let imported = 0;
      let failed = 0;
      const results: Array<{ mikroCode: string; status: string; reason?: string }> = [];

      for (const row of rows) {
        const mikroCode = String(row?.mikroCode || '').trim();
        if (!mikroCode) {
          failed += 1;
          results.push({ mikroCode: '', status: 'SKIPPED', reason: 'Missing mikro code' });
          continue;
        }

        const product = productMap.get(mikroCode);
        if (!product) {
          failed += 1;
          results.push({ mikroCode, status: 'SKIPPED', reason: 'Product not found' });
          continue;
        }

        const priceInvoiced = parseNumber(row?.priceInvoiced);
        const priceWhiteRaw = parseNumber(row?.priceWhite);
        const priceWhite = priceWhiteRaw && priceWhiteRaw > 0 ? priceWhiteRaw : null;
        if (!priceInvoiced || priceInvoiced <= 0) {
          failed += 1;
          results.push({ mikroCode, status: 'SKIPPED', reason: 'Invalid invoiced price' });
          continue;
        }

        const minQuantityRaw = parseNumber(row?.minQuantity);
        const minQuantity = minQuantityRaw && minQuantityRaw > 0 ? Math.floor(minQuantityRaw) : 1;

        const validFromDate = parseDateValue(row?.validFrom) || new Date();
        const validToDate = parseDateValue(row?.validTo);

        if (validToDate && validToDate < validFromDate) {
          failed += 1;
          results.push({ mikroCode, status: 'SKIPPED', reason: 'validTo before validFrom' });
          continue;
        }

        const customerProductCode = row?.customerProductCode ? String(row.customerProductCode).trim() : null;

        const data = {
          customerId,
          productId: product.id,
          priceInvoiced,
          priceWhite,
          customerProductCode: customerProductCode || null,
          minQuantity,
          validFrom: validFromDate,
          validTo: validToDate,
        };

        await prisma.customerPriceAgreement.upsert({
          where: {
            customerId_productId: {
              customerId,
              productId: product.id,
            },
          },
          create: data,
          update: data,
        });

        imported += 1;
        results.push({ mikroCode, status: 'IMPORTED' });
      }

      res.json({ imported, failed, results });
    } catch (error) {
      next(error);
    }
  }
}

export default new AgreementController();
