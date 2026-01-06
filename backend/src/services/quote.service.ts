/**
 * Quote (Teklif) Service
 *
 * Teklif oluÅŸturma, admin onayÄ± ve Mikro'ya yazma iÅŸlemleri.
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import priceListService from './price-list.service';
import { generateQuoteNumber } from '../utils/quoteNumber';
import { MikroCustomerSaleMovement } from '../types';

type QuotePriceSource = 'LAST_SALE' | 'PRICE_LIST' | 'MANUAL';
type PriceType = 'INVOICED' | 'WHITE';

interface QuoteItemInput {
  productId?: string;
  productCode?: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  priceSource: QuotePriceSource;
  priceListNo?: number;
  priceType?: PriceType;
  vatZeroed?: boolean;
  manualLine?: boolean;
  manualVatRate?: number;
  lineDescription?: string;
  lastSale?: {
    saleDate?: string;
    unitPrice?: number;
    quantity?: number;
    vatZeroed?: boolean;
  };
}

interface CreateQuoteInput {
  customerId: string;
  validityDate: string;
  note?: string;
  documentNo?: string;
  responsibleCode?: string;
  contactId?: string;
  vatZeroed?: boolean;
  items: QuoteItemInput[];
}

const DEFAULT_WHATSAPP_TEMPLATE =
  'Merhaba {{customerName}}, teklifiniz hazÄ±r. Teklif No: {{quoteNumber}}. Link: {{quoteLink}}. GeÃ§erlilik: {{validUntil}}.';

const normalizePriceType = (value?: string): PriceType =>
  value === 'WHITE' ? 'WHITE' : 'INVOICED';

const safeNumber = (value: any, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundUp2 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil((value + Number.EPSILON) * 100) / 100;
};

class QuoteService {
  private parseMikroNumber(mikroNumber?: string | null) {
    if (!mikroNumber) return null;
    const parts = mikroNumber.trim().split('-');
    if (parts.length < 2) return null;
    const evrakSeri = parts[0];
    const evrakSira = Number(parts[1]);
    if (!evrakSeri || !Number.isFinite(evrakSira)) return null;
    return { evrakSeri, evrakSira };
  }

  private toDateKey(dateValue?: Date | string | null) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  async getPreferences(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        quoteLastSalesCount: true,
        quoteWhatsappTemplate: true,
        quoteResponsibleCode: true,
      },
    });

    return {
      lastSalesCount: user?.quoteLastSalesCount ?? 1,
      whatsappTemplate: user?.quoteWhatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
      responsibleCode: user?.quoteResponsibleCode || null,
    };
  }

  async updatePreferences(
    userId: string,
    data: { lastSalesCount?: number; whatsappTemplate?: string; responsibleCode?: string | null }
  ) {
    const updateData: any = {};
    if (data.lastSalesCount !== undefined) {
      updateData.quoteLastSalesCount = Math.max(1, Math.min(10, data.lastSalesCount));
    }
    if (data.whatsappTemplate !== undefined) {
      updateData.quoteWhatsappTemplate = data.whatsappTemplate.trim();
    }
    if (data.responsibleCode !== undefined) {
      updateData.quoteResponsibleCode = data.responsibleCode || null;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        quoteLastSalesCount: true,
        quoteWhatsappTemplate: true,
        quoteResponsibleCode: true,
      },
    });

    return {
      lastSalesCount: user.quoteLastSalesCount,
      whatsappTemplate: user.quoteWhatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
      responsibleCode: user.quoteResponsibleCode || null,
    };
  }

  async getCustomerPurchasedProducts(customerId: string, lastSalesCount: number) {
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        displayName: true,
        mikroCariCode: true,
        customerType: true,
      },
    });

    if (!customer || !customer.mikroCariCode) {
      throw new Error('Customer not found or missing Mikro cari code');
    }

    const purchasedCodes = await mikroService.getPurchasedProductCodes(customer.mikroCariCode);
    if (purchasedCodes.length === 0) {
      return { customer, products: [] };
    }

    const products = await prisma.product.findMany({
      where: {
        active: true,
        mikroCode: { in: purchasedCodes },
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const priceStatsMap = await priceListService.getPriceStatsMap(
      products.map((product) => product.mikroCode)
    );

    let salesMovements: MikroCustomerSaleMovement[] = [];
    try {
      salesMovements = await mikroService.getCustomerSalesMovements(
        customer.mikroCariCode,
        purchasedCodes,
        Math.max(1, lastSalesCount)
      );
    } catch (error) {
      console.error('Customer sales movements failed', { customerId, error });
    }

    const salesMap = new Map<string, typeof salesMovements>();
    for (const movement of salesMovements) {
      const list = salesMap.get(movement.productCode) || [];
      list.push(movement);
      salesMap.set(movement.productCode, list);
    }

    const productsWithLists = products.map((product) => {
      const priceStats = priceStatsMap.get(product.mikroCode) || null;
      const mikroPriceLists: Record<string, number> = {};
      for (let listNo = 1; listNo <= 10; listNo += 1) {
        mikroPriceLists[listNo] = priceListService.getListPrice(priceStats, listNo);
      }

      return {
        id: product.id,
        name: product.name,
        mikroCode: product.mikroCode,
        unit: product.unit,
        vatRate: product.vatRate,
        lastEntryPrice: product.lastEntryPrice,
        currentCost: product.currentCost,
        warehouseStocks: product.warehouseStocks,
        category: product.category,
        mikroPriceLists,
        lastSales: salesMap.get(product.mikroCode) || [],
      };
    });

    const getSaleTime = (value?: string | Date) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    const sortedProducts = productsWithLists.sort((a, b) => {
      const aTime = getSaleTime(a.lastSales?.[0]?.saleDate);
      const bTime = getSaleTime(b.lastSales?.[0]?.saleDate);
      if (aTime === bTime) {
        return a.name.localeCompare(b.name, 'tr');
      }
      return bTime - aTime;
    });

    return { customer, products: sortedProducts };
  }

  async createQuote(input: CreateQuoteInput, createdById: string) {
    const {
      customerId,
      validityDate,
      note,
      documentNo,
      responsibleCode,
      contactId,
      vatZeroed = false,
      items,
    } = input;

    if (!customerId || !validityDate || !Array.isArray(items) || items.length === 0) {
      throw new Error('Missing required fields');
    }

    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        displayName: true,
        mikroCariCode: true,
      },
    });

    if (!customer || !customer.mikroCariCode) {
      throw new Error('Customer not found or missing Mikro cari code');
    }

    let contact: { id: string; name: string; phone: string | null; email: string | null } | null = null;
    if (contactId) {
      const contactRow = await prisma.customerContact.findUnique({
        where: { id: contactId },
        select: { id: true, customerId: true, name: true, phone: true, email: true },
      });
      if (!contactRow || contactRow.customerId !== customerId) {
        throw new Error('Contact not found for customer');
      }
      contact = {
        id: contactRow.id,
        name: contactRow.name,
        phone: contactRow.phone,
        email: contactRow.email,
      };
    }

    const productIds = items
      .filter((item) => !item.manualLine && item.productId)
      .map((item) => item.productId as string);
    const productCodes = items
      .filter((item) => !item.manualLine && !item.productId && item.productCode)
      .map((item) => item.productCode as string);

    const products = await prisma.product.findMany({
      where: {
        OR: [
          ...(productIds.length > 0 ? [{ id: { in: productIds } }] : []),
          ...(productCodes.length > 0 ? [{ mikroCode: { in: productCodes } }] : []),
        ],
      },
    });

    const productById = new Map(products.map((product) => [product.id, product]));
    const productByCode = new Map(products.map((product) => [product.mikroCode, product]));
    const priceStatsMap = await priceListService.getPriceStatsMap(
      products.map((product) => product.mikroCode)
    );

    const currentYear = new Date().getFullYear();
    const quotePrefix = `TEK-${currentYear}-`;
    const lastQuote = await prisma.quote.findFirst({
      where: { quoteNumber: { startsWith: quotePrefix } },
      orderBy: { createdAt: 'desc' },
      select: { quoteNumber: true },
    });
    const quoteNumber = generateQuoteNumber(lastQuote?.quoteNumber);

    let totalAmount = 0;
    let totalVat = 0;
    let hasBlockedItem = false;

    const preparedItems = items.map((item, index) => {
      const quantity = Math.max(1, Math.floor(safeNumber(item.quantity, 1)));
      const priceSource = item.priceSource;
      const isManualLine = Boolean(item.manualLine);
      const priceType = normalizePriceType(item.priceType);
      const vatZeroedLine = vatZeroed || Boolean(item.vatZeroed);

      if (!priceSource || !['LAST_SALE', 'PRICE_LIST', 'MANUAL'].includes(priceSource)) {
        throw new Error(`Price source missing for item ${index + 1}`);
      }

      let product = null;
      if (!isManualLine) {
        product =
          (item.productId ? productById.get(item.productId) : null) ||
          (item.productCode ? productByCode.get(item.productCode) : null) ||
          null;
        if (!product) {
          throw new Error(`Product not found for item ${index + 1}`);
        }
      }

      const productCode = isManualLine
        ? (item.productCode || '')
        : (product as any).mikroCode;
      const productName = isManualLine
        ? (item.productName || '')
        : (product as any).name;

      if (!productCode || !productName) {
        throw new Error(`Product information missing for item ${index + 1}`);
      }

      if (isManualLine) {
        const allowedCodes = ['B101070', 'B101071'];
        if (!allowedCodes.includes(productCode)) {
          throw new Error(`Manual line product code must be one of: ${allowedCodes.join(', ')}`);
        }
      }

      const vatRate = isManualLine
        ? safeNumber(item.manualVatRate, 0)
        : safeNumber((product as any).vatRate, 0);

      if (isManualLine && vatRate !== 0.1 && vatRate !== 0.2) {
        throw new Error(`Manual line VAT rate must be 0.1 or 0.2`);
      }

      let unitPrice = safeNumber(item.unitPrice, 0);
      let priceListNo: number | undefined = item.priceListNo;

      if (priceSource === 'PRICE_LIST') {
        const listNo = safeNumber(item.priceListNo, 0);
        if (!listNo) {
          throw new Error(`Price list not selected for item ${index + 1}`);
        }
        const priceStats = priceStatsMap.get(productCode) || null;
        const listPrice = priceListService.getListPrice(priceStats, listNo);
        if (!listPrice) {
          throw new Error(`Selected price list has no price for ${productCode}`);
        }
        unitPrice = listPrice;
        priceListNo = listNo;
      }

      unitPrice = roundUp2(unitPrice);
      if (unitPrice <= 0) {
        throw new Error(`Unit price missing for item ${index + 1}`);
      }

      const totalPrice = unitPrice * quantity;
      const vatAmount = vatZeroedLine ? 0 : totalPrice * vatRate;

      totalAmount += totalPrice;
      totalVat += vatAmount;

      let isBlocked = false;
      let blockedReason: string | undefined;
      if (priceSource === 'MANUAL' && !isManualLine) {
        const lastEntryPrice = safeNumber((product as any).lastEntryPrice, 0);
        if (lastEntryPrice > 0 && unitPrice < lastEntryPrice * 1.05) {
          isBlocked = true;
          blockedReason = 'Son giriÅŸ maliyetine gÃ¶re %5 altÄ± fiyat';
          hasBlockedItem = true;
        }
      }

      return {
        productId: isManualLine ? null : (product as any).id,
        productCode,
        productName,
        quantity,
        unitPrice,
        totalPrice,
        priceSource,
        priceListNo,
        priceType,
        vatRate,
        vatZeroed: vatZeroedLine,
        isManualLine,
        isBlocked,
        blockedReason,
        sourceSaleDate: item.lastSale?.saleDate ? new Date(item.lastSale.saleDate) : null,
        sourceSalePrice: item.lastSale?.unitPrice ?? null,
        sourceSaleQuantity: item.lastSale?.quantity ?? null,
        sourceSaleVatZeroed: item.lastSale?.vatZeroed ?? null,
        lineDescription: item.lineDescription?.trim() || null,
      };
    });

    const grandTotal = totalAmount + totalVat;

    const resolvedDocumentNo = (documentNo || note || '').trim();
    const resolvedResponsibleCode = (responsibleCode || '').trim();

    let mikroNumber: string | undefined;
    let mikroGuid: string | undefined;

    if (!hasBlockedItem) {
      const mikroResult = await mikroService.writeQuote({
        cariCode: customer.mikroCariCode,
        quoteNumber,
        validityDate: new Date(validityDate),
        description: note?.trim() || '',
        documentNo: resolvedDocumentNo,
        responsibleCode: resolvedResponsibleCode,
        items: preparedItems.map((item) => ({
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatZeroed ? 0 : item.vatRate,
          lineDescription: item.lineDescription || item.productName,
          priceListNo: item.priceListNo ?? 0,
        })),
      });
      mikroNumber = mikroResult?.quoteNumber;
      mikroGuid = mikroResult?.guid;
    }

    const finalQuoteNumber = mikroNumber || quoteNumber;

    const quote = await prisma.quote.create({
      data: {
        quoteNumber: finalQuoteNumber,
        status: hasBlockedItem ? 'PENDING_APPROVAL' : 'SENT_TO_MIKRO',
        customerId: customer.id,
        createdById,
        note: note?.trim() || null,
        documentNo: resolvedDocumentNo || null,
        responsibleCode: resolvedResponsibleCode || null,
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? null,
        contactPhone: contact?.phone ?? null,
        contactEmail: contact?.email ?? null,
        validityDate: new Date(validityDate),
        vatZeroed,
        totalAmount,
        totalVat,
        grandTotal,
        mikroNumber: mikroNumber || null,
        mikroGuid: mikroGuid || null,
        items: {
          create: preparedItems,
        },
      },
      include: {
        items: true,
        customer: { select: { id: true, name: true, mikroCariCode: true } },
      },
    });

    return quote;
  }

  async getQuotesForStaff(userId: string, role: string, status?: string) {
    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (role === 'SALES_REP') {
      where.createdById = userId;
    }

    const quotes = await prisma.quote.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                imageUrl: true,
                unit: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            displayName: true,
            mikroName: true,
            mikroCariCode: true,
            customerType: true,
            city: true,
            district: true,
            phone: true,
            groupCode: true,
            sectorCode: true,
            paymentTerm: true,
            hasEInvoice: true,
            balance: true,
            isLocked: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        adminUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return quotes;
  }

  async getQuoteByIdForStaff(quoteId: string) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: {
          include: {
            product: {
              select: {
                imageUrl: true,
                unit: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            displayName: true,
            email: true,
            mikroName: true,
            mikroCariCode: true,
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true, phone: true },
        },
        adminUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    return quote;
  }

  async getQuotesForCustomer(customerId: string) {
    const quotes = await prisma.quote.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return quotes;
  }

  async getQuoteByIdForCustomer(customerId: string, quoteId: string) {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, customerId },
      include: { items: true },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    return quote;
  }

  async approveQuote(quoteId: string, adminUserId: string, adminNote?: string) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: true,
        customer: { select: { mikroCariCode: true } },
      },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== 'PENDING_APPROVAL') {
      throw new Error('Quote is not pending approval');
    }

    if (!quote.customer.mikroCariCode) {
      throw new Error('Customer has no Mikro cari code');
    }

    const mikroResult = await mikroService.writeQuote({
      cariCode: quote.customer.mikroCariCode,
      quoteNumber: quote.quoteNumber,
      validityDate: quote.validityDate,
      description: quote.note || '',
      documentNo: quote.documentNo || quote.note || '',
      responsibleCode: quote.responsibleCode || '',
      items: quote.items.map((item) => ({
        productCode: item.productCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatZeroed ? 0 : item.vatRate,
        lineDescription: item.lineDescription || item.productName,
        priceListNo: item.priceListNo ?? 0,
      })),
    });

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'SENT_TO_MIKRO',
        adminNote: adminNote?.trim() || null,
        adminUserId,
        adminActionAt: new Date(),
        mikroNumber: mikroResult?.quoteNumber || null,
        mikroGuid: mikroResult?.guid || null,
        quoteNumber: mikroResult?.quoteNumber || quote.quoteNumber,
      },
      include: { items: true },
    });

    return updated;
  }

  async rejectQuote(quoteId: string, adminUserId: string, adminNote: string) {
    const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== 'PENDING_APPROVAL') {
      throw new Error('Quote is not pending approval');
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'REJECTED',
        adminNote: adminNote.trim(),
        adminUserId,
        adminActionAt: new Date(),
      },
      include: { items: true },
    });

    return updated;
  }

  async syncQuoteFromMikro(quoteId: string) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { items: true },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (!quote.mikroNumber) {
      throw new Error('Quote has no Mikro number');
    }

    const parsed = this.parseMikroNumber(quote.mikroNumber);
    if (!parsed) {
      throw new Error('Invalid Mikro number format');
    }

    const mikroLines = await mikroService.getQuoteLines(parsed);
    if (!mikroLines.length) {
      throw new Error('Mikro quote not found');
    }

    const manualCodes = new Set(['B101070', 'B101071']);
    const productCodes = Array.from(new Set(
      mikroLines
        .map((line) => (line.productCode || '').trim())
        .filter(Boolean)
    ));

    const products = await prisma.product.findMany({
      where: { mikroCode: { in: productCodes } },
    });
    const productMap = new Map(products.map((product) => [product.mikroCode, product]));

    const normalizedLines = mikroLines.map((line) => {
      const productCode = (line.productCode || '').trim();
      const quantity = Math.max(0, safeNumber(line.quantity, 0));
      const unitPrice = Math.max(0, safeNumber(line.unitPrice, 0));
      const vatRate = mikroService.convertVatCodeToRate(safeNumber(line.vatCode, 0));
      const priceListNo = Math.max(0, safeNumber(line.priceListNo, 0));
      const lineDescription = (line.lineDescription || '').trim();
      return {
        ...line,
        productCode,
        quantity,
        unitPrice,
        vatRate,
        priceListNo,
        lineDescription,
        lineTotal: unitPrice * quantity,
      };
    });

    const usedIds = new Set<string>();
    const updates: Array<{ id: string; data: any }> = [];
    const creates: any[] = [];
    let changed = false;

    const isDifferentNumber = (a: number, b: number) => Math.abs(a - b) > 0.01;

    for (const line of normalizedLines) {
      const product = productMap.get(line.productCode);
      const isManualLine = !product || manualCodes.has(line.productCode);
      const productName = product ? product.name : (line.lineDescription || 'Manual line');
      const priceListNo = line.priceListNo || null;
      const priceSource = priceListNo ? 'PRICE_LIST' : 'MANUAL';
      const vatZeroed = line.vatRate === 0;

      let match = quote.items.find((item) =>
        !usedIds.has(item.id) &&
        item.productCode === line.productCode &&
        !isDifferentNumber(item.unitPrice, line.unitPrice)
      );
      if (!match) {
        match = quote.items.find((item) =>
          !usedIds.has(item.id) &&
          item.productCode === line.productCode
        );
      }

      const baseData = {
        productId: product ? product.id : null,
        productCode: line.productCode,
        productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.lineTotal,
        priceSource,
        priceListNo: priceListNo || null,
        priceType: 'INVOICED' as const,
        vatRate: line.vatRate,
        vatZeroed,
        isManualLine,
        isBlocked: false,
        blockedReason: null,
        sourceSaleDate: null,
        sourceSalePrice: null,
        sourceSaleQuantity: null,
        sourceSaleVatZeroed: null,
        lineDescription: line.lineDescription || null,
      };

      if (match) {
        usedIds.add(match.id);
        const needsUpdate =
          match.productCode !== baseData.productCode ||
          match.productName !== baseData.productName ||
          match.quantity !== baseData.quantity ||
          isDifferentNumber(match.unitPrice, baseData.unitPrice) ||
          isDifferentNumber(match.totalPrice, baseData.totalPrice) ||
          match.priceSource !== baseData.priceSource ||
          (match.priceListNo || null) !== baseData.priceListNo ||
          match.vatZeroed !== baseData.vatZeroed ||
          isDifferentNumber(match.vatRate, baseData.vatRate) ||
          match.isManualLine !== baseData.isManualLine ||
          (match.lineDescription || '') !== (baseData.lineDescription || '');

        if (needsUpdate) {
          changed = true;
          updates.push({ id: match.id, data: baseData });
        }
      } else {
        changed = true;
        creates.push({
          quoteId,
          ...baseData,
        });
      }
    }

    const deleteIds = quote.items
      .filter((item) => !usedIds.has(item.id))
      .map((item) => item.id);
    if (deleteIds.length > 0) {
      changed = true;
    }

    let nextValidityDate: Date | null = null;
    const firstLine = normalizedLines[0];
    if (firstLine) {
      const startDate = firstLine.baslangicTarihi || firstLine.evrakTarihi;
      const validityDays = safeNumber(firstLine.gecerlilikSure, 0);
      if (startDate && validityDays > 0) {
        nextValidityDate = new Date(startDate);
        nextValidityDate.setDate(nextValidityDate.getDate() + validityDays);
      }
    }

    const totalAmount = normalizedLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const totalVat = normalizedLines.reduce((sum, line) => sum + line.lineTotal * (line.vatRate || 0), 0);
    const grandTotal = totalAmount + totalVat;
    const allVatZero = normalizedLines.every((line) => line.vatRate === 0);

    const totalsChanged =
      isDifferentNumber(quote.totalAmount, totalAmount) ||
      isDifferentNumber(quote.totalVat, totalVat) ||
      isDifferentNumber(quote.grandTotal, grandTotal) ||
      quote.vatZeroed !== allVatZero;
    if (totalsChanged) {
      changed = true;
    }

    if (nextValidityDate && this.toDateKey(nextValidityDate) !== this.toDateKey(quote.validityDate)) {
      changed = true;
    }

    if (!changed) {
      return { quote, updated: false };
    }

    const updatedQuote = await prisma.$transaction(async (tx) => {
      if (deleteIds.length) {
        await tx.quoteItem.deleteMany({ where: { id: { in: deleteIds } } });
      }

      for (const update of updates) {
        await tx.quoteItem.update({ where: { id: update.id }, data: update.data });
      }

      if (creates.length) {
        await tx.quoteItem.createMany({ data: creates });
      }

      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          totalAmount,
          totalVat,
          grandTotal,
          vatZeroed: allVatZero,
          validityDate: nextValidityDate || quote.validityDate,
          mikroUpdatedAt: new Date(),
        },
        include: { items: true },
      });

      return updated;
    });

    return { quote: updatedQuote, updated: true };
  }

  async syncQuotesFromMikro() {
    const quotes = await prisma.quote.findMany({
      where: {
        mikroNumber: { not: null },
        status: {
          in: ['SENT_TO_MIKRO', 'CUSTOMER_ACCEPTED', 'CUSTOMER_REJECTED'],
        },
      },
      select: { id: true },
    });

    let updatedCount = 0;

    for (const quote of quotes) {
      try {
        const result = await this.syncQuoteFromMikro(quote.id);
        if (result.updated) {
          updatedCount += 1;
        }
      } catch (error) {
        console.error('Quote sync failed', { quoteId: quote.id, error });
      }
    }

    return { total: quotes.length, updatedCount };
  }

  async respondToQuote(quoteId: string, customerId: string, decision: 'accept' | 'reject') {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, customerId },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (quote.status !== 'SENT_TO_MIKRO') {
      throw new Error('Quote is not available for response');
    }

    const newStatus = decision === 'accept' ? 'CUSTOMER_ACCEPTED' : 'CUSTOMER_REJECTED';

    return prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: newStatus,
        customerRespondedAt: new Date(),
      },
    });
  }
}

export default new QuoteService();
