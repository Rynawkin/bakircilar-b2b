/**
 * Quote (Teklif) Service
 *
 * Teklif oluÅŸturma, admin onayÄ± ve Mikro'ya yazma iÅŸlemleri.
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import priceListService from './price-list.service';
import { generateQuoteNumber } from '../utils/quoteNumber';
import { generateOrderNumber } from '../utils/orderNumber';
import { MikroCustomerSaleMovement } from '../types';

type QuotePriceSource = 'LAST_SALE' | 'PRICE_LIST' | 'MANUAL';
type PriceType = 'INVOICED' | 'WHITE';

interface QuoteItemInput {
  productId?: string;
  productCode?: string;
  productName?: string;
  unit?: string;
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

const VALID_POOL_SORTS = new Set([
  'default',
  'stock1_desc',
  'stock6_desc',
  'price_asc',
  'price_desc',
]);

const normalizePriceType = (value?: string): PriceType =>
  value === 'WHITE' ? 'WHITE' : 'INVOICED';

const safeNumber = (value: any, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};


const buildQuoteItemDiff = (
  beforeItems: Array<{ productCode: string; productName: string; quantity: number; unitPrice: number; priceType?: string; lineDescription?: string | null }>,
  afterItems: Array<{ productCode: string; productName: string; quantity: number; unitPrice: number; priceType?: string; lineDescription?: string | null }>
) => {
  const normalize = (item: { productCode: string; productName: string; quantity: number; unitPrice: number; priceType?: string; lineDescription?: string | null }) => ({
    productCode: item.productCode,
    productName: item.productName,
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    priceType: normalizePriceType(item.priceType),
    lineDescription: item.lineDescription || '',
  });

  const beforeMap = new Map<string, ReturnType<typeof normalize>[]>();
  beforeItems.forEach((item) => {
    const snapshot = normalize(item);
    const list = beforeMap.get(snapshot.productCode) || [];
    list.push(snapshot);
    beforeMap.set(snapshot.productCode, list);
  });

  const added: Array<ReturnType<typeof normalize>> = [];
  const removed: Array<ReturnType<typeof normalize>> = [];
  const updated: Array<{ productCode: string; productName: string; changes: Record<string, { from: any; to: any }> }> = [];

  afterItems.forEach((item) => {
    const snapshot = normalize(item);
    const candidates = beforeMap.get(snapshot.productCode) || [];
    if (candidates.length === 0) {
      added.push(snapshot);
      return;
    }

    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate, index) => {
      const score = Math.abs(candidate.unitPrice - snapshot.unitPrice) + Math.abs(candidate.quantity - snapshot.quantity);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    const matched = candidates.splice(bestIndex, 1)[0];
    if (candidates.length === 0) {
      beforeMap.delete(snapshot.productCode);
    } else {
      beforeMap.set(snapshot.productCode, candidates);
    }

    const changes: Record<string, { from: any; to: any }> = {};
    if (matched.quantity !== snapshot.quantity) {
      changes.quantity = { from: matched.quantity, to: snapshot.quantity };
    }
    if (Math.abs(matched.unitPrice - snapshot.unitPrice) > 0.001) {
      changes.unitPrice = { from: matched.unitPrice, to: snapshot.unitPrice };
    }
    if (matched.priceType !== snapshot.priceType) {
      changes.priceType = { from: matched.priceType, to: snapshot.priceType };
    }
    if (matched.lineDescription !== snapshot.lineDescription) {
      changes.lineDescription = { from: matched.lineDescription, to: snapshot.lineDescription };
    }

    if (Object.keys(changes).length > 0) {
      updated.push({ productCode: snapshot.productCode, productName: snapshot.productName, changes });
    }
  });

  beforeMap.forEach((items) => {
    items.forEach((item) => removed.push(item));
  });

  return { added, removed, updated };
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

  private sanitizeColumnWidths(input?: Record<string, unknown> | null) {
    if (!input || typeof input !== 'object') return null;
    const sanitized: Record<string, number> = {};
    Object.entries(input).forEach(([key, value]) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        const rounded = Math.round(parsed);
        sanitized[key] = Math.min(800, Math.max(40, rounded));
      }
    });
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }

  private sanitizePoolColorRules(input?: unknown) {
    if (!Array.isArray(input)) return null;
    const sanitized = input
      .map((rule) => {
        if (!rule || typeof rule !== 'object') return null;
        const entry = rule as Record<string, unknown>;
        const warehouse = entry.warehouse === '6' ? '6' : '1';
        const operator = typeof entry.operator === 'string' && ['>', '>=', '<', '<=', '='].includes(entry.operator)
          ? entry.operator
          : '>';
        const color = typeof entry.color === 'string' && ['green', 'yellow', 'blue', 'red', 'slate'].includes(entry.color)
          ? entry.color
          : 'green';
        const threshold = Number.isFinite(Number(entry.threshold)) ? Number(entry.threshold) : 0;
        const enabled = Boolean(entry.enabled);
        const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : undefined;
        return { id, enabled, warehouse, operator, threshold, color };
      })
      .filter(Boolean);
    return sanitized.length > 0 ? sanitized : null;
  }

  async getPreferences(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        quoteLastSalesCount: true,
        quoteWhatsappTemplate: true,
        quoteResponsibleCode: true,
        quoteColumnWidths: true,
        quotePoolSort: true,
        quotePoolPriceListNo: true,
        quotePoolColorRules: true,
      },
    });

    return {
      lastSalesCount: user?.quoteLastSalesCount ?? 1,
      whatsappTemplate: user?.quoteWhatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
      responsibleCode: user?.quoteResponsibleCode || null,
      columnWidths: (user?.quoteColumnWidths as Record<string, number> | null) || null,
      poolSort: user?.quotePoolSort || 'default',
      poolPriceListNo:
        Number.isFinite(user?.quotePoolPriceListNo as number)
          ? Number(user?.quotePoolPriceListNo)
          : null,
      poolColorRules: this.sanitizePoolColorRules(user?.quotePoolColorRules) || null,
    };
  }

  async updatePreferences(
    userId: string,
    data: {
      lastSalesCount?: number;
      whatsappTemplate?: string;
      responsibleCode?: string | null;
      columnWidths?: Record<string, unknown> | null;
      poolSort?: string | null;
      poolPriceListNo?: number | null;
      poolColorRules?: unknown[] | null;
    }
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
    if (data.columnWidths !== undefined) {
      updateData.quoteColumnWidths = this.sanitizeColumnWidths(data.columnWidths);
    }
    if (data.poolSort !== undefined) {
      updateData.quotePoolSort =
        data.poolSort && VALID_POOL_SORTS.has(data.poolSort) ? data.poolSort : 'default';
    }
    if (data.poolPriceListNo !== undefined) {
      const listNo = Number(data.poolPriceListNo);
      updateData.quotePoolPriceListNo =
        Number.isFinite(listNo) && listNo >= 1 && listNo <= 10 ? listNo : null;
    }
    if (data.poolColorRules !== undefined) {
      updateData.quotePoolColorRules = this.sanitizePoolColorRules(data.poolColorRules);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        quoteLastSalesCount: true,
        quoteWhatsappTemplate: true,
        quoteResponsibleCode: true,
        quoteColumnWidths: true,
        quotePoolSort: true,
        quotePoolPriceListNo: true,
        quotePoolColorRules: true,
      },
    });

    return {
      lastSalesCount: user.quoteLastSalesCount,
      whatsappTemplate: user.quoteWhatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
      responsibleCode: user.quoteResponsibleCode || null,
      columnWidths: (user.quoteColumnWidths as Record<string, number> | null) || null,
      poolSort: user.quotePoolSort || 'default',
      poolPriceListNo:
        Number.isFinite(user.quotePoolPriceListNo as number)
          ? Number(user.quotePoolPriceListNo)
          : null,
      poolColorRules: this.sanitizePoolColorRules(user.quotePoolColorRules) || null,
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
        unit2: product.unit2 || null,
        unit2Factor: product.unit2Factor ?? null,
        vatRate: product.vatRate,
        lastEntryPrice: product.lastEntryPrice,
        lastEntryDate: product.lastEntryDate,
        currentCost: product.currentCost,
        currentCostDate: product.currentCostDate,
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
        paymentPlanNo: true,
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
      const resolvedUnit = isManualLine
        ? (item.unit || '')
        : ((product as any).unit || '');
      const unit = resolvedUnit.trim() || 'ADET';

      if (!productCode || !productName) {
        throw new Error(`Product information missing for item ${index + 1}`);
      }

      if (isManualLine) {
        const allowedCodes = ['B101070', 'B101071', 'B110365'];
        if (!allowedCodes.includes(productCode)) {
          throw new Error(`Manual line product code must be one of: ${allowedCodes.join(', ')}`);
        }
      }

      const vatRate = isManualLine
        ? safeNumber(item.manualVatRate, 0)
        : safeNumber((product as any).vatRate, 0);

      if (isManualLine && vatRate !== 0.01 && vatRate !== 0.1 && vatRate !== 0.2) {
        throw new Error(`Manual line VAT rate must be 0.01, 0.1 or 0.2`);
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
      if (!isManualLine) {
        const lastEntryPrice = safeNumber((product as any).lastEntryPrice, 0);
        const currentCost = safeNumber((product as any).currentCost, 0);
        const baseCost = lastEntryPrice > 0 ? lastEntryPrice : currentCost;
        if (baseCost > 0 && unitPrice < baseCost * 1.05) {
          isBlocked = true;
          blockedReason = lastEntryPrice > 0
            ? 'Son giris maliyetine gore %5 alti fiyat'
            : 'Guncel maliyete gore %5 alti fiyat';
          hasBlockedItem = true;
        }
      }

      return {
        productId: isManualLine ? null : (product as any).id,
        productCode,
        productName,
        unit,
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
        lineOrder: index + 1,
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
        paymentPlanNo: customer.paymentPlanNo ?? 0,
        items: preparedItems.map((item) => ({
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatZeroed ? 0 : item.vatRate,
          lineDescription: item.isManualLine
            ? item.productName
            : (item.lineDescription || ''),
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
        updatedById: createdById,
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
        items: { orderBy: { lineOrder: 'asc' } },
        customer: { select: { id: true, name: true, mikroCariCode: true } },
      },
    });

    await prisma.quoteHistory.create({
      data: {
        quoteId: quote.id,
        action: 'CREATED',
        actorId: createdById,
        summary: 'Teklif olusturuldu',
        payload: {
          totalAmount,
          itemCount: preparedItems.length,
          status: quote.status,
        },
      },
    });

    return quote;
  }

  async updateQuote(quoteId: string, input: CreateQuoteInput, updatedById: string) {
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

    if (!validityDate || !Array.isArray(items) || items.length === 0) {
      throw new Error('Missing required fields');
    }

    const existing = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: { orderBy: { lineOrder: 'asc' } },
        customer: { select: { id: true, mikroCariCode: true, paymentPlanNo: true } },
      },
    });

    if (!existing) {
      throw new Error('Quote not found');
    }

    const targetCustomerId = customerId || existing.customerId;

    if (!targetCustomerId) {
      throw new Error('Customer not found');
    }

    if (!['PENDING_APPROVAL', 'SENT_TO_MIKRO'].includes(existing.status)) {
      throw new Error('Quote cannot be edited');
    }

    const customer = await prisma.user.findUnique({
      where: { id: targetCustomerId },
      select: {
        id: true,
        name: true,
        displayName: true,
        mikroCariCode: true,
        paymentPlanNo: true,
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
      if (!contactRow || contactRow.customerId !== targetCustomerId) {
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
      const resolvedUnit = isManualLine
        ? (item.unit || '')
        : ((product as any).unit || '');
      const unit = resolvedUnit.trim() || 'ADET';

      if (!productCode || !productName) {
        throw new Error(`Product information missing for item ${index + 1}`);
      }

      if (isManualLine) {
        const allowedCodes = ['B101070', 'B101071', 'B110365'];
        if (!allowedCodes.includes(productCode)) {
          throw new Error(`Manual line product code must be one of: ${allowedCodes.join(', ')}`);
        }
      }

      const vatRate = isManualLine
        ? safeNumber(item.manualVatRate, 0)
        : safeNumber((product as any).vatRate, 0);

      if (isManualLine && vatRate !== 0.01 && vatRate !== 0.1 && vatRate !== 0.2) {
        throw new Error(`Manual line VAT rate must be 0.01, 0.1 or 0.2`);
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
      if (!isManualLine) {
        const lastEntryPrice = safeNumber((product as any).lastEntryPrice, 0);
        const currentCost = safeNumber((product as any).currentCost, 0);
        const baseCost = lastEntryPrice > 0 ? lastEntryPrice : currentCost;
        if (baseCost > 0 && unitPrice < baseCost * 1.05) {
          isBlocked = true;
          blockedReason = lastEntryPrice > 0
            ? 'Son giris maliyetine gore %5 alti fiyat'
            : 'Guncel maliyete gore %5 alti fiyat';
          hasBlockedItem = true;
        }
      }

      return {
        productId: isManualLine ? null : (product as any).id,
        productCode,
        productName,
        unit,
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
        lineOrder: index + 1,
      };
    });

    const itemChanges = buildQuoteItemDiff(existing.items, preparedItems);

    const grandTotal = totalAmount + totalVat;

    const resolvedDocumentNo = (documentNo || note || existing.documentNo || '').trim();
    const resolvedResponsibleCode = (responsibleCode || existing.responsibleCode || '').trim();

    let mikroUpdated = false;
    if (existing.mikroNumber && !hasBlockedItem) {
      const parsed = this.parseMikroNumber(existing.mikroNumber);
      if (!parsed) {
        throw new Error('Invalid Mikro number format');
      }

      await mikroService.updateQuote({
        evrakSeri: parsed.evrakSeri,
        evrakSira: parsed.evrakSira,
        cariCode: customer.mikroCariCode,
        validityDate: new Date(validityDate),
        description: note?.trim() || '',
        documentNo: resolvedDocumentNo,
        responsibleCode: resolvedResponsibleCode,
        paymentPlanNo: customer.paymentPlanNo ?? 0,
        items: preparedItems.map((item) => ({
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatZeroed ? 0 : item.vatRate,
          lineDescription: item.isManualLine
            ? item.productName
            : (item.lineDescription || ''),
          priceListNo: item.priceListNo ?? 0,
        })),
      });
      mikroUpdated = true;
    }

    const nextStatus = hasBlockedItem
      ? 'PENDING_APPROVAL'
      : mikroUpdated
        ? 'SENT_TO_MIKRO'
        : existing.status;

    const updatedQuote = await prisma.$transaction(async (tx) => {
      await tx.quoteItem.deleteMany({ where: { quoteId } });
      await tx.quoteItem.createMany({
        data: preparedItems.map((item) => ({
          quoteId,
          ...item,
        })),
      });

      return tx.quote.update({
        where: { id: quoteId },
        data: {
          updatedById,
          status: nextStatus,
          customerId: customer.id,
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
          mikroUpdatedAt: mikroUpdated ? new Date() : existing.mikroUpdatedAt,
        },
        include: { items: { orderBy: { lineOrder: 'asc' } } },
      });
    });

    await prisma.quoteHistory.create({
      data: {
        quoteId: updatedQuote.id,
        action: 'UPDATED',
        actorId: updatedById,
        summary: 'Teklif guncellendi',
        payload: {
          totalAmount,
          itemCount: preparedItems.length,
          status: updatedQuote.status,
          changes: itemChanges,
        },
      },
    });

    return updatedQuote;
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
          orderBy: { lineOrder: 'asc' },
          include: {
            product: {
              select: {
                imageUrl: true,
                unit: true,
                lastEntryPrice: true,
                lastEntryDate: true,
                currentCost: true,
                currentCostDate: true,
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
            paymentPlanNo: true,
            paymentPlanCode: true,
            paymentPlanName: true,
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
        updatedBy: {
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
        orders: {
          select: { id: true, orderNumber: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return quotes;
  }

  async getQuoteByIdForStaff(quoteId: string, options?: { lastSalesCount?: number }) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: {
          orderBy: { lineOrder: 'asc' },
          include: {
            product: {
              select: {
                imageUrl: true,
                unit: true,
                lastEntryPrice: true,
                lastEntryDate: true,
                currentCost: true,
                currentCostDate: true,
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
        updatedBy: {
          select: { id: true, name: true, email: true, phone: true },
        },
        adminUser: {
          select: { id: true, name: true, email: true },
        },
        orders: {
          select: { id: true, orderNumber: true, createdAt: true },
        },
      },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const productCodes = quote.items
      .filter((item) => !item.isManualLine && item.productCode)
      .map((item) => item.productCode);
    const uniqueCodes = [...new Set(productCodes)];
    const priceStatsMap = await priceListService.getPriceStatsMap(uniqueCodes);

    let salesMovements: MikroCustomerSaleMovement[] = [];
    const customerCode = quote.customer?.mikroCariCode || '';
    const lastSalesLimit = Math.max(1, options?.lastSalesCount ?? 1);
    if (customerCode && uniqueCodes.length > 0) {
      try {
        salesMovements = await mikroService.getCustomerSalesMovements(
          customerCode,
          uniqueCodes,
          lastSalesLimit
        );
      } catch (error) {
        console.error('Quote sales movements failed', { quoteId, error });
      }
    }

    const salesMap = new Map<string, MikroCustomerSaleMovement[]>();
    for (const movement of salesMovements) {
      const list = salesMap.get(movement.productCode) || [];
      list.push(movement);
      salesMap.set(movement.productCode, list);
    }

    const items = quote.items.map((item) => {
      if (item.isManualLine || !item.productCode) {
        return {
          ...item,
          lastSales: [],
          mikroPriceLists: undefined,
        };
      }

      const priceStats = priceStatsMap.get(item.productCode) || null;
      const mikroPriceLists: Record<string, number> = {};
      for (let listNo = 1; listNo <= 10; listNo += 1) {
        mikroPriceLists[listNo] = priceListService.getListPrice(priceStats, listNo);
      }

      return {
        ...item,
        lastSales: salesMap.get(item.productCode) || [],
        mikroPriceLists,
      };
    });

    return { ...quote, items };
  }

  async getQuoteHistory(quoteId: string) {
    const history = await prisma.quoteHistory.findMany({
      where: { quoteId },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return history;
  }

  async getQuotesForCustomer(customerId: string) {
    const quotes = await prisma.quote.findMany({
      where: { customerId },
      include: { items: { orderBy: { lineOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return quotes;
  }

  async getQuoteByIdForCustomer(customerId: string, quoteId: string) {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, customerId },
      include: { items: { orderBy: { lineOrder: 'asc' } } },
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
        items: { orderBy: { lineOrder: 'asc' } },
        customer: { select: { mikroCariCode: true, paymentPlanNo: true } },
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
      paymentPlanNo: quote.customer.paymentPlanNo ?? 0,
      items: quote.items.map((item) => ({
        productCode: item.productCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatZeroed ? 0 : item.vatRate,
        lineDescription: item.isManualLine
          ? item.productName
          : (item.lineDescription || ''),
        priceListNo: item.priceListNo ?? 0,
      })),
    });

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'SENT_TO_MIKRO',
        updatedById: adminUserId,
        adminNote: adminNote?.trim() || null,
        adminUserId,
        adminActionAt: new Date(),
        mikroNumber: mikroResult?.quoteNumber || null,
        mikroGuid: mikroResult?.guid || null,
        quoteNumber: mikroResult?.quoteNumber || quote.quoteNumber,
      },
      include: { items: { orderBy: { lineOrder: 'asc' } } },
    });

    await prisma.quoteHistory.create({
      data: {
        quoteId: updated.id,
        action: 'STATUS_CHANGED',
        actorId: adminUserId,
        summary: "Teklif onaylandi ve Mikro'ya gonderildi",
        payload: {
          status: updated.status,
          mikroNumber: updated.mikroNumber,
        },
      },
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
        updatedById: adminUserId,
        status: 'REJECTED',
        adminNote: adminNote.trim(),
        adminUserId,
        adminActionAt: new Date(),
      },
      include: { items: { orderBy: { lineOrder: 'asc' } } },
    });

    await prisma.quoteHistory.create({
      data: {
        quoteId: updated.id,
        action: 'STATUS_CHANGED',
        actorId: adminUserId,
        summary: 'Teklif reddedildi',
        payload: {
          status: updated.status,
        },
      },
    });

    return updated;
  }

  async syncQuoteFromMikro(quoteId: string) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { items: { orderBy: { lineOrder: 'asc' } } },
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

    const manualCodes = new Set(['B101070', 'B101071', 'B110365']);
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

    for (const [index, line] of normalizedLines.entries()) {
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

      const unit = product?.unit || match?.unit || 'ADET';
      const baseData = {
        productId: product ? product.id : null,
        productCode: line.productCode,
        productName,
        unit,
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
        lineOrder: index + 1,
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
          (match.lineDescription || '') !== (baseData.lineDescription || '') ||
          match.lineOrder !== baseData.lineOrder;

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
        include: { items: { orderBy: { lineOrder: 'asc' } } },
      });

      return updated;
    });

    let conversionUpdated = updatedQuote;
    try {
      const hasMikroOrder = await mikroService.hasOrdersForQuote(parsed);
      if (hasMikroOrder && !quote.convertedAt) {
        conversionUpdated = await prisma.quote.update({
          where: { id: quoteId },
          data: {
            convertedAt: new Date(),
            convertedSource: 'MIKRO',
          },
          include: { items: { orderBy: { lineOrder: 'asc' } } },
        });
        await prisma.quoteHistory.create({
          data: {
            quoteId,
            action: 'CONVERTED',
            summary: 'Mikrodan siparise cevrildi',
            payload: { source: 'MIKRO' },
          },
        });
      }
    } catch (error) {
      console.error('Mikro conversion check failed', { quoteId, error });
    }

    return { quote: conversionUpdated, updated: true };
  }

  async convertQuoteToOrder(
    quoteId: string,
    input: {
      selectedItemIds: string[];
      closeReasons?: Record<string, string>;
      warehouseNo: number;
      invoicedSeries?: string;
      invoicedSira?: number;
      whiteSeries?: string;
      whiteSira?: number;
      itemUpdates?: Array<{ id: string; quantity?: number; responsibilityCenter?: string }>;
      adminUserId: string;
    }
  ) {
    const {
      selectedItemIds,
      closeReasons,
      warehouseNo,
      invoicedSeries,
      invoicedSira,
      whiteSeries,
      whiteSira,
      itemUpdates,
      adminUserId,
    } = input;

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: { orderBy: { lineOrder: 'asc' } },
        customer: {
          select: {
            mikroCariCode: true,
            name: true,
            displayName: true,
            email: true,
            phone: true,
            city: true,
            district: true,
            hasEInvoice: true,
          },
        },
      },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (!quote.mikroNumber) {
      throw new Error('Quote has no Mikro number');
    }

    if (!quote.customer?.mikroCariCode) {
      throw new Error('Customer missing Mikro cari code');
    }

    if (quote.status === 'REJECTED') {
      throw new Error('Rejected quotes cannot be converted');
    }

    const warehouseValueRaw = Number(warehouseNo);
    const warehouseValue =
      Number.isFinite(warehouseValueRaw) && warehouseValueRaw > 0
        ? Math.trunc(warehouseValueRaw)
        : null;
    if (!warehouseValue) {
      throw new Error('Warehouse is required');
    }

    const selectedSet = new Set((selectedItemIds || []).filter(Boolean));
    const updateMap = new Map<string, { quantity?: number; responsibilityCenter?: string }>();
    (itemUpdates || []).forEach((update) => {
      if (update && update.id) {
        updateMap.set(update.id, {
          quantity: update.quantity,
          responsibilityCenter: update.responsibilityCenter,
        });
      }
    });

    const normalizedItems = quote.items.map((item) => {
      const update = updateMap.get(item.id);
      const resolvedQuantity = Number(update?.quantity);
      const quantity = Number.isFinite(resolvedQuantity) && resolvedQuantity > 0
        ? Math.trunc(resolvedQuantity)
        : item.quantity;
      return {
        ...item,
        quantity,
        responsibilityCenter: update?.responsibilityCenter?.trim() || undefined,
      };
    });

    const selectedItems = normalizedItems.filter((item) => selectedSet.has(item.id));
    if (selectedItems.length === 0) {
      throw new Error('No quote items selected');
    }

    const unselectedItems = normalizedItems.filter((item) => !selectedSet.has(item.id));
    const closeReasonsMap = closeReasons || {};
    const missingReasons = unselectedItems.filter((item) => !String(closeReasonsMap[item.id] || '').trim());
    if (missingReasons.length > 0) {
      throw new Error('Close reason is required for unselected items');
    }


    const itemDiff = buildQuoteItemDiff(quote.items as any, normalizedItems as any);
    const hasDiff = itemDiff.added.length > 0 || itemDiff.removed.length > 0 || itemDiff.updated.length > 0;
    if (hasDiff) {
      const totals = normalizedItems.reduce(
        (acc, item) => {
          const lineTotal = (item.unitPrice || 0) * (item.quantity || 0);
          const vatAmount = item.vatZeroed ? 0 : lineTotal * (item.vatRate || 0);
          acc.totalAmount += lineTotal;
          acc.totalVat += vatAmount;
          return acc;
        },
        { totalAmount: 0, totalVat: 0 }
      );
      const grandTotal = totals.totalAmount + totals.totalVat;

      await prisma.$transaction(async (tx) => {
        const originalById = new Map(quote.items.map((item) => [item.id, item]));
        const updates = normalizedItems.map((item) => {
          const original = originalById.get(item.id);
          if (!original) return null;
          if (original.quantity !== item.quantity) {
            return tx.quoteItem.update({
              where: { id: item.id },
              data: {
                quantity: item.quantity,
                totalPrice: item.unitPrice * item.quantity,
              },
            });
          }
          return null;
        }).filter(Boolean);

        if (updates.length > 0) {
          await Promise.all(updates as any);
        }

        await tx.quote.update({
          where: { id: quoteId },
          data: {
            updatedById: adminUserId,
            totalAmount: totals.totalAmount,
            totalVat: totals.totalVat,
            grandTotal,
          },
        });

        await tx.quoteHistory.create({
          data: {
            quoteId: quote.id,
            action: 'UPDATED',
            actorId: adminUserId,
            summary: 'Teklif satirlari guncellendi',
            payload: {
              totalAmount: totals.totalAmount,
              itemCount: normalizedItems.length,
              status: quote.status,
              changes: itemDiff,
            },
          },
        });
      });
    }

    const parsed = this.parseMikroNumber(quote.mikroNumber);
    if (!parsed) {
      throw new Error('Invalid Mikro number format');
    }

    const guidRows = await mikroService.getQuoteLineGuids(parsed);
    const guidBySatir = new Map<number, string>();
    const guidByProduct = new Map<string, Array<{ guid: string; unitPrice: number; quantity: number }>>();
    guidRows.forEach((row) => {
      if (row.guid) {
        guidBySatir.set(row.satirNo, row.guid);
        const list = guidByProduct.get(row.productCode) || [];
        list.push({ guid: row.guid, unitPrice: row.unitPrice, quantity: row.quantity });
        guidByProduct.set(row.productCode, list);
      }
    });

    const mappedItems = selectedItems.map((item) => {
      const satirNo = item.lineOrder - 1;
      let guid = guidBySatir.get(satirNo);
      if (!guid) {
        const candidates = guidByProduct.get(item.productCode) || [];
        if (candidates.length === 1) {
          guid = candidates[0].guid;
        } else if (candidates.length > 1) {
          const matched = candidates.find((candidate) =>
            Math.abs(candidate.unitPrice - item.unitPrice) < 0.01 &&
            Math.abs(candidate.quantity - item.quantity) < 0.01
          );
          guid = matched?.guid || candidates[0].guid;
        }
      }

      return {
        productCode: item.productCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        vatZeroed: item.vatZeroed,
        priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
        lineDescription: item.lineDescription || (item.isManualLine ? item.productName : ''),
        responsibilityCenter: (item as any).responsibilityCenter || undefined,
        quoteLineGuid: guid,
      };
    });

    const invoicedItems = mappedItems.filter((item) => item.priceType === 'INVOICED');
    const whiteItems = mappedItems.filter((item) => item.priceType === 'WHITE');

    const mikroOrderIds: string[] = [];
    let invoicedOrderId: string | null = null;
    let whiteOrderId: string | null = null;
    const noteBase = `B2B Teklif ${quote.quoteNumber} -> Siparis`;
    const documentNo = quote.documentNo || undefined;

    if (invoicedItems.length > 0) {
      if (!invoicedSeries) {
        throw new Error('Invoiced order series is required');
      }
      invoicedOrderId = await mikroService.writeOrder({
        cariCode: quote.customer.mikroCariCode,
        items: invoicedItems.map((item) => ({
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatZeroed ? 0 : item.vatRate,
          lineDescription: item.lineDescription || undefined,
          responsibilityCenter: item.responsibilityCenter || undefined,
          quoteLineGuid: item.quoteLineGuid,
        })),
        applyVAT: true,
        description: noteBase,
        documentNo,
        evrakSeri: String(invoicedSeries).trim(),
        evrakSira: Number.isFinite(Number(invoicedSira)) ? Number(invoicedSira) : undefined,
        warehouseNo: warehouseValue,
      });
      if (invoicedOrderId) {
        mikroOrderIds.push(invoicedOrderId);
      }
    }

    if (whiteItems.length > 0) {
      if (!whiteSeries) {
        throw new Error('White order series is required');
      }
      whiteOrderId = await mikroService.writeOrder({
        cariCode: quote.customer.mikroCariCode,
        items: whiteItems.map((item) => ({
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: 0,
          lineDescription: item.lineDescription || undefined,
          responsibilityCenter: item.responsibilityCenter || undefined,
          quoteLineGuid: item.quoteLineGuid,
        })),
        applyVAT: false,
        description: noteBase,
        documentNo,
        evrakSeri: String(whiteSeries).trim(),
        evrakSira: Number.isFinite(Number(whiteSira)) ? Number(whiteSira) : undefined,
        warehouseNo: warehouseValue,
      });
      if (whiteOrderId) {
        mikroOrderIds.push(whiteOrderId);
      }
    }

    let closedCount = 0;
    if (unselectedItems.length > 0) {
      const linesToClose = unselectedItems.map((item) => ({
        satirNo: item.lineOrder - 1,
        reason: String(closeReasonsMap[item.id]).trim(),
      }));
      closedCount = await mikroService.closeQuoteLines({
        evrakSeri: parsed.evrakSeri,
        evrakSira: parsed.evrakSira,
        lines: linesToClose,
      });
    }

    const conversionNote = `Siparise cevrildi: ${mikroOrderIds.join(', ')}`;
    const adminNote = quote.adminNote
      ? `${quote.adminNote} | ${conversionNote}`
      : conversionNote;

    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });
    const orderNumber = generateOrderNumber(lastOrder?.orderNumber);

    const totalAmount = selectedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: quote.customerId,
        sourceQuoteId: quote.id,
        requestedById: adminUserId,
        status: 'APPROVED',
        totalAmount,
        mikroOrderIds,
        approvedAt: new Date(),
        customerOrderNumber: quote.documentNo?.trim() || undefined,
        adminNote,
        items: {
          create: selectedItems.map((item) => ({
            productId: item.productId || undefined,
            productName: item.productName || item.productCode,
            mikroCode: item.productCode,
            quantity: item.quantity,
            priceType: item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED',
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
            lineNote: item.lineDescription || undefined,
            responsibilityCenter: (item as any).responsibilityCenter || undefined,
            status: 'APPROVED',
            approvedQuantity: item.quantity,
            mikroOrderId:
              item.priceType === 'WHITE'
                ? whiteOrderId || undefined
                : invoicedOrderId || undefined,
          })),
        },
      },
    });

    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        adminUserId,
        adminActionAt: new Date(),
        adminNote,
        updatedById: adminUserId,
        convertedAt: new Date(),
        convertedSource: 'B2B',
      },
    });

    await prisma.quoteHistory.create({
      data: {
        quoteId: quote.id,
        action: 'CONVERTED',
        actorId: adminUserId,
        summary: 'Teklif siparise cevrildi',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          mikroOrderIds,
        },
      },
    });

    return { mikroOrderIds, closedCount, orderId: order.id, orderNumber: order.orderNumber };
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
