import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import notificationService from './notification.service';
import supplierCostService from './supplier-cost.service';
import stockCreateService, { StockCreateInput } from './stock-create.service';
import { rolePermissionService } from './role-permission.service';
import { splitSearchTokens } from '../utils/search';

type Actor = {
  userId?: string | null;
  role?: string | null;
  email?: string | null;
  assignedSectorCodes?: string[];
};

type OfferInput = {
  supplierCode?: string | null;
  supplierName?: string | null;
  supplierProductCode?: string | null;
  costP?: number | string | null;
  costT?: number | string | null;
  currency?: string | null;
  exchangeRate?: number | string | null;
  vatIncluded?: boolean | null;
  vatRate?: number | string | null;
  unit?: string | null;
  unitFactor?: number | string | null;
  minOrderQuantity?: number | string | null;
  leadTimeDays?: number | string | null;
  validUntil?: string | Date | null;
  quoteDate?: string | Date | null;
  note?: string | null;
  attachmentUrl?: string | null;
};

const REQUEST_TYPES = new Set(['EXISTING_PRODUCT', 'NEW_STOCK']);
const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const STATUSES = new Set(['REQUESTED', 'IN_REVIEW', 'SENT_TO_SALES', 'SALES_APPROVED', 'SALES_REJECTED', 'COMPLETED', 'CANCELLED']);
const PURCHASING_ROLES = new Set(['HEAD_ADMIN', 'ADMIN', 'MANAGER']);

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizeCode = (value: unknown) => normalizeText(value).toLocaleUpperCase('tr-TR');
const asNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toDateOrNull = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
};
const roundMoney = (value: number) => Number(value.toFixed(4));

class PriceVerificationService {
  async listRequests(query: any, actor: Actor) {
    const scope = await this.resolveScope(actor);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(Number(query.limit) || 40, 100));
    const search = normalizeText(query.search);
    const type = normalizeText(query.type).toUpperCase();
    const status = normalizeText(query.status).toUpperCase();
    const mine = String(query.mine || '').toLowerCase() === 'true';

    const where: Prisma.PriceVerificationRequestWhereInput = {};
    if (!scope.canManage || mine) where.createdById = scope.userId;
    if (type && type !== 'ALL') where.type = type;
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { requestNo: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { customerCode: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { salesNote: { contains: search, mode: 'insensitive' } },
        { procurementNote: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total, summaryRows] = await Promise.all([
      prisma.priceVerificationRequest.findMany({
        where,
        include: {
          offers: { orderBy: [{ normalizedCostP: 'asc' }, { createdAt: 'desc' }] },
          notes: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.priceVerificationRequest.count({ where }),
      prisma.priceVerificationRequest.groupBy({
        by: ['status'],
        where: scope.canManage ? {} : { createdById: scope.userId },
        _count: { _all: true },
      }),
    ]);

    const mappedItems = await this.mapRequestsWithProductMeta(items);

    return {
      items: mappedItems,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: Object.fromEntries(summaryRows.map((row) => [row.status, row._count._all])),
      scope: { canManage: scope.canManage },
    };
  }

  async getRequest(id: string, actor: Actor) {
    const request = await this.requireRequest(id, actor);
    return { request: await this.mapRequestWithProductMeta(request) };
  }

  async createRequest(input: any, actor: Actor) {
    const scope = await this.resolveScope(actor);
    const userInfo = await this.resolveUser(scope.userId);
    const type = REQUEST_TYPES.has(normalizeText(input.type).toUpperCase()) ? normalizeText(input.type).toUpperCase() : 'EXISTING_PRODUCT';
    const priority = PRIORITIES.has(normalizeText(input.priority).toUpperCase()) ? normalizeText(input.priority).toUpperCase() : 'NORMAL';
    const productCode = normalizeCode(input.productCode);
    const productName = normalizeText(input.productName);

    let product: any = null;
    let stockPayload: StockCreateInput | null = null;
    if (type === 'EXISTING_PRODUCT') {
      if (!productCode) throw new AppError('Stok kodu zorunludur.', 400, ErrorCode.BAD_REQUEST);
      product = await prisma.product.findFirst({
        where: { mikroCode: productCode },
        select: {
          id: true,
          mikroCode: true,
          name: true,
          unit: true,
          vatRate: true,
          currentCost: true,
          currentCostDate: true,
        },
      });
      if (!product) throw new AppError('Urun bulunamadi.', 404, ErrorCode.NOT_FOUND);
    } else {
      stockPayload = this.normalizeStockPayload(input.stockCreatePayload || input.stockPayload || {});
    }

    const request = await prisma.priceVerificationRequest.create({
      data: {
        requestNo: await this.generateRequestNo(),
        type,
        status: 'REQUESTED',
        priority,
        productId: product?.id || null,
        productCode: type === 'EXISTING_PRODUCT' ? product.mikroCode : null,
        productName: type === 'EXISTING_PRODUCT' ? product.name : (productName || normalizeText(stockPayload?.name) || 'Yeni stok fiyat teyidi'),
        unit: type === 'EXISTING_PRODUCT' ? product.unit : normalizeText(stockPayload?.mainUnit),
        quantity: input.quantity !== undefined && input.quantity !== null && input.quantity !== '' ? asNumber(input.quantity, 0) : null,
        customerId: normalizeText(input.customerId) || null,
        customerCode: normalizeText(input.customerCode) || null,
        customerName: normalizeText(input.customerName) || null,
        sourceType: normalizeText(input.sourceType).toUpperCase() || 'MANUAL',
        sourceRef: normalizeText(input.sourceRef) || null,
        sourceUrl: normalizeText(input.sourceUrl) || null,
        currentUnitPrice: input.currentUnitPrice !== undefined && input.currentUnitPrice !== null && input.currentUnitPrice !== '' ? asNumber(input.currentUnitPrice, 0) : null,
        currentCost: product?.currentCost ?? null,
        currentCostDate: product?.currentCostDate ?? null,
        stockCreatePayload: stockPayload ? stockPayload as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
        salesNote: normalizeText(input.salesNote || input.note) || null,
        createdById: scope.userId,
        createdByName: userInfo.userName,
      },
      include: { offers: true, notes: true },
    });

    await this.addSystemNote(request.id, `${userInfo.userName || 'Kullanici'} fiyat teyit talebi olusturdu.`);
    await this.notifyPurchasing({
      title: 'Yeni fiyat guncellik teyidi',
      body: `${request.requestNo} - ${request.productCode || request.productName}`,
      linkUrl: `/supplier-costs?tab=requests&requestId=${request.id}`,
    }, scope.userId);

    return { request: await this.mapRequestWithProductMeta(request) };
  }

  async addOffer(requestId: string, input: OfferInput, actor: Actor) {
    await this.requireManager(actor);
    const request = await this.requireRequestForManage(requestId);
    if (['COMPLETED', 'CANCELLED'].includes(request.status)) {
      throw new AppError('Tamamlanan veya iptal edilen talebe fiyat girilemez.', 400, ErrorCode.BAD_REQUEST);
    }
    const userInfo = await this.resolveUser(actor.userId || null);
    const normalized = await this.normalizeOfferInput(request, input);

    const offer = await prisma.priceVerificationOffer.create({
      data: {
        requestId: request.id,
        ...normalized,
        createdById: actor.userId || null,
        createdByName: userInfo.userName,
      },
    });

    await prisma.priceVerificationRequest.update({
      where: { id: request.id },
      data: { status: request.status === 'REQUESTED' ? 'IN_REVIEW' : request.status, procurementNote: normalizeText(input.note) || request.procurementNote || null },
    });
    await this.addSystemNote(request.id, `${offer.supplierName} icin ${offer.normalizedCostP.toLocaleString('tr-TR')} normalize maliyet girildi.`, actor.userId || null);

    return this.getRequest(request.id, actor);
  }

  async submitToSales(requestId: string, input: any, actor: Actor) {
    await this.requireManager(actor);
    const request = await this.requireRequestForManage(requestId);
    if (!request.offers.length) throw new AppError('Satis onayina gondermeden once en az bir fiyat girin.', 400, ErrorCode.BAD_REQUEST);
    if (['COMPLETED', 'CANCELLED'].includes(request.status)) throw new AppError('Bu talep kapali.', 400, ErrorCode.BAD_REQUEST);

    const updated = await prisma.priceVerificationRequest.update({
      where: { id: request.id },
      data: {
        status: 'SENT_TO_SALES',
        submittedToSalesAt: new Date(),
        procurementNote: normalizeText(input.note) || request.procurementNote || null,
      },
      include: { offers: { orderBy: [{ normalizedCostP: 'asc' }, { createdAt: 'desc' }] }, notes: { orderBy: { createdAt: 'desc' } } },
    });

    await this.addSystemNote(request.id, 'Talep satis onayina gonderildi.', actor.userId || null);
    await notificationService.createForUsers([request.createdById], {
      title: 'Fiyat teyidi satis onayinda',
      body: `${request.requestNo} - ${request.productCode || request.productName}`,
      linkUrl: `/supplier-costs?tab=requests&requestId=${request.id}`,
    });

    return { request: await this.mapRequestWithProductMeta(updated) };
  }

  async salesDecision(requestId: string, input: any, actor: Actor) {
    const request = await this.requireRequest(requestId, actor);
    if (request.createdById !== actor.userId) {
      throw new AppError('Bu talep icin satis karari verme yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }
    if (request.status !== 'SENT_TO_SALES') {
      throw new AppError('Talep satis onayi asamasinda degil.', 400, ErrorCode.BAD_REQUEST);
    }

    const approved = Boolean(input.approved);
    const selectedOfferId = normalizeText(input.selectedOfferId);
    if (approved && !selectedOfferId) throw new AppError('Onay icin fiyat secimi zorunlu.', 400, ErrorCode.BAD_REQUEST);
    if (approved && !request.offers.some((offer) => offer.id === selectedOfferId)) {
      throw new AppError('Secilen fiyat bu talebe ait degil.', 400, ErrorCode.BAD_REQUEST);
    }

    const updated = await prisma.priceVerificationRequest.update({
      where: { id: request.id },
      data: {
        status: approved ? 'SALES_APPROVED' : 'SALES_REJECTED',
        selectedOfferId: approved ? selectedOfferId : null,
        salesApprovedAt: approved ? new Date() : null,
        salesDecisionNote: normalizeText(input.note) || null,
      },
      include: { offers: { orderBy: [{ normalizedCostP: 'asc' }, { createdAt: 'desc' }] }, notes: { orderBy: { createdAt: 'desc' } } },
    });

    await this.addSystemNote(request.id, approved ? 'Satis secilen fiyati onayladi.' : 'Satis talebi reddetti.', actor.userId || null);
    await this.notifyPurchasing({
      title: approved ? 'Fiyat teyidi satis tarafindan onaylandi' : 'Fiyat teyidi satis tarafindan reddedildi',
      body: `${request.requestNo} - ${request.productCode || request.productName}`,
      linkUrl: `/supplier-costs?tab=requests&requestId=${request.id}`,
    }, actor.userId || null);

    return { request: await this.mapRequestWithProductMeta(updated) };
  }

  async completeRequest(requestId: string, input: any, actor: Actor) {
    await this.requireManager(actor);
    const request = await this.requireRequestForManage(requestId);
    if (request.status !== 'SALES_APPROVED') {
      throw new AppError('Tamamlama icin satis onayi gerekli.', 400, ErrorCode.BAD_REQUEST);
    }
    const selectedOffer = request.offers.find((offer) => offer.id === request.selectedOfferId);
    if (!selectedOffer) throw new AppError('Secili fiyat bulunamadi.', 400, ErrorCode.BAD_REQUEST);

    let productCode = normalizeCode(request.productCode);
    if (request.type === 'NEW_STOCK') {
      const stockPayload = this.normalizeStockPayload(input.stockCreatePayload || request.stockCreatePayload || {});
      stockPayload.currentCost = selectedOffer.normalizedCostP;
      const created = await stockCreateService.create([stockPayload], actor.userId || null);
      productCode = normalizeCode(created.created?.[0]?.stockCode);
      if (!productCode) throw new AppError('Stok acildi ancak stok kodu alinamadi.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
      await prisma.priceVerificationRequest.update({
        where: { id: request.id },
        data: { stockCreatePayload: stockPayload as unknown as Prisma.InputJsonValue },
      });
    }

    const supplierCost = await supplierCostService.createCost({
      productCode,
      supplierCode: selectedOffer.supplierCode,
      supplierName: selectedOffer.supplierName,
      supplierProductCode: selectedOffer.supplierProductCode,
      costP: selectedOffer.costP,
      costT: selectedOffer.costT,
      currency: selectedOffer.currency,
      exchangeRate: selectedOffer.exchangeRate,
      vatIncluded: selectedOffer.vatIncluded,
      vatRate: selectedOffer.vatRate,
      unit: selectedOffer.unit,
      unitFactor: selectedOffer.unitFactor,
      minOrderQuantity: selectedOffer.minOrderQuantity,
      leadTimeDays: selectedOffer.leadTimeDays,
      validUntil: selectedOffer.validUntil,
      quoteDate: selectedOffer.quoteDate,
      note: `${request.requestNo} fiyat teyidinden aktarildi. ${selectedOffer.note || ''}`.trim(),
      sourceType: 'PRICE_VERIFICATION',
      attachmentUrl: selectedOffer.attachmentUrl,
    }, { userId: actor.userId || null });

    const application = await supplierCostService.applyCost({
      id: supplierCost.cost.id,
      updatePriceLists: input.updatePriceLists !== false,
      note: normalizeText(input.note) || `${request.requestNo} fiyat teyidi uygulandi.`,
    }, { userId: actor.userId || null });

    await prisma.priceVerificationOffer.update({
      where: { id: selectedOffer.id },
      data: { supplierCostId: supplierCost.cost.id },
    });

    const updated = await prisma.priceVerificationRequest.update({
      where: { id: request.id },
      data: {
        status: 'COMPLETED',
        productCode,
        selectedSupplierCostId: supplierCost.cost.id,
        completedAt: new Date(),
      },
      include: { offers: { orderBy: [{ normalizedCostP: 'asc' }, { createdAt: 'desc' }] }, notes: { orderBy: { createdAt: 'desc' } } },
    });

    await this.addSystemNote(request.id, 'Talep tamamlandi; secili fiyat Mikro maliyet/fiyat listelerine uygulandi.', actor.userId || null);
    await notificationService.createForUsers([request.createdById], {
      title: 'Fiyat teyidi tamamlandi',
      body: `${request.requestNo} - ${productCode || request.productName}`,
      linkUrl: `/supplier-costs?tab=requests&requestId=${request.id}`,
    });

    return { request: await this.mapRequestWithProductMeta(updated), supplierCost: supplierCost.cost, application };
  }

  async cancelRequest(requestId: string, input: any, actor: Actor) {
    const request = await this.requireRequest(requestId, actor);
    const scope = await this.resolveScope(actor);
    if (!scope.canManage && request.createdById !== actor.userId) {
      throw new AppError('Talebi iptal etme yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }
    if (['COMPLETED', 'CANCELLED'].includes(request.status)) throw new AppError('Bu talep zaten kapali.', 400, ErrorCode.BAD_REQUEST);
    const updated = await prisma.priceVerificationRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), salesDecisionNote: normalizeText(input.note) || request.salesDecisionNote },
      include: { offers: { orderBy: [{ normalizedCostP: 'asc' }, { createdAt: 'desc' }] }, notes: { orderBy: { createdAt: 'desc' } } },
    });
    await this.addSystemNote(request.id, `Talep iptal edildi.${input.note ? ` Not: ${normalizeText(input.note)}` : ''}`, actor.userId || null);
    return { request: await this.mapRequestWithProductMeta(updated) };
  }

  async addNote(requestId: string, input: any, actor: Actor) {
    const request = await this.requireRequest(requestId, actor);
    const body = normalizeText(input.body || input.note);
    if (!body) throw new AppError('Not bos olamaz.', 400, ErrorCode.BAD_REQUEST);
    const userInfo = await this.resolveUser(actor.userId || null);
    const note = await prisma.priceVerificationNote.create({
      data: {
        requestId: request.id,
        authorId: actor.userId || null,
        authorName: userInfo.userName,
        body,
        visibility: normalizeText(input.visibility).toUpperCase() || 'INTERNAL',
      },
    });
    return { note };
  }

  async previewStockPayload(input: any) {
    const stockPayload = this.normalizeStockPayload(input.stockCreatePayload || input.stockPayload || input);
    return stockCreateService.preview([stockPayload]);
  }

  async searchProducts(input: { search?: string; limit?: number }) {
    return supplierCostService.searchProducts(input);
  }

  async searchSuppliers(input: { search?: string; limit?: number }) {
    return supplierCostService.searchSuppliers(input);
  }

  async searchCustomers(input: { search?: string; limit?: number; actor: Actor }) {
    const tokens = splitSearchTokens(input.search || '');
    const limit = Math.max(1, Math.min(Number(input.limit) || 25, 60));
    const base: Prisma.UserWhereInput = {
      role: 'CUSTOMER' as any,
      parentCustomerId: null,
      mikroCariCode: { not: null },
      active: true,
    };
    const sectorCodes = (input.actor.assignedSectorCodes || [])
      .map((code) => normalizeText(code))
      .filter(Boolean);
    const scopedBase: Prisma.UserWhereInput = input.actor.role === 'SALES_REP'
      ? {
          AND: [
            base,
            sectorCodes.length > 0 ? { sectorCode: { in: sectorCodes } } : { id: '__no_customer_scope__' },
          ],
        }
      : base;

    const where: Prisma.UserWhereInput = {
      AND: [
        scopedBase,
        ...(tokens.length > 0
          ? tokens.map((token) => ({
              OR: [
                { mikroCariCode: { contains: token, mode: 'insensitive' as const } },
                { displayName: { contains: token, mode: 'insensitive' as const } },
                { mikroName: { contains: token, mode: 'insensitive' as const } },
                { name: { contains: token, mode: 'insensitive' as const } },
                { city: { contains: token, mode: 'insensitive' as const } },
                { district: { contains: token, mode: 'insensitive' as const } },
                { sectorCode: { contains: token, mode: 'insensitive' as const } },
              ],
            }))
          : []),
      ],
    };

    const customers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        mikroCariCode: true,
        name: true,
        mikroName: true,
        displayName: true,
        city: true,
        district: true,
        sectorCode: true,
        balance: true,
      },
      orderBy: [{ mikroCariCode: 'asc' }],
      take: limit,
    });

    return {
      customers: customers.map((customer) => ({
        ...customer,
        code: customer.mikroCariCode,
        title: customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode,
      })),
    };
  }

  async getStockMetadata() {
    return stockCreateService.getMetadata();
  }

  async searchStockLookups(type: any, search = '', limit?: number) {
    if (!['supplier', 'brand', 'category', 'package', 'template'].includes(type)) {
      throw new AppError('Gecersiz arama tipi.', 400, ErrorCode.BAD_REQUEST);
    }
    return stockCreateService.searchLookups(type, search, limit);
  }

  private async requireRequest(id: string, actor: Actor) {
    const request = await prisma.priceVerificationRequest.findUnique({
      where: { id },
      include: {
        offers: { orderBy: [{ normalizedCostP: 'asc' }, { createdAt: 'desc' }] },
        notes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!request) throw new AppError('Fiyat teyit talebi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    const scope = await this.resolveScope(actor);
    if (!scope.canManage && request.createdById !== scope.userId) {
      throw new AppError('Bu talebi gorme yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }
    return request;
  }

  private async requireRequestForManage(id: string) {
    const request = await prisma.priceVerificationRequest.findUnique({
      where: { id },
      include: {
        offers: { orderBy: [{ normalizedCostP: 'asc' }, { createdAt: 'desc' }] },
        notes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!request) throw new AppError('Fiyat teyit talebi bulunamadi.', 404, ErrorCode.NOT_FOUND);
    return request;
  }

  private async requireManager(actor: Actor) {
    const scope = await this.resolveScope(actor);
    if (!scope.canManage) throw new AppError('Bu islem icin satin alma/admin yetkisi gerekli.', 403, ErrorCode.FORBIDDEN);
    return scope;
  }

  private async resolveScope(actor: Actor) {
    const userId = actor.userId || null;
    const role = actor.role || null;
    let canManage = PURCHASING_ROLES.has(String(role));
    if (!canManage && userId) {
      canManage = await rolePermissionService.hasPermission(userId, 'admin:supplier-costs').catch(() => false);
    }
    return { userId, role, canManage };
  }

  private async resolveUser(userId?: string | null) {
    if (!userId) return { userName: null as string | null };
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, mikroName: true, name: true, email: true },
    });
    return { userName: row?.displayName || row?.mikroName || row?.name || row?.email || null };
  }

  private async notifyPurchasing(payload: { title: string; body?: string | null; linkUrl?: string | null }, excludeUserId?: string | null) {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        role: { in: ['HEAD_ADMIN', 'ADMIN', 'MANAGER'] as any },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    await notificationService.createForUsers(users.map((user) => user.id), payload);
  }

  private async generateRequestNo() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
      const requestNo = `FT-${datePart}-${suffix}`;
      const existing = await prisma.priceVerificationRequest.findUnique({ where: { requestNo }, select: { id: true } });
      if (!existing) return requestNo;
    }
    return `FT-${Date.now()}`;
  }

  private normalizeStockPayload(input: any): StockCreateInput {
    const payload = (input && typeof input === 'object') ? { ...input } : {};
    payload.templateCode = normalizeCode(payload.templateCode) || 'B108423';
    payload.name = normalizeText(payload.name);
    payload.foreignName = normalizeText(payload.foreignName);
    payload.shortName = normalizeText(payload.shortName);
    payload.mainUnit = normalizeCode(payload.mainUnit);
    payload.supplierCode = normalizeText(payload.supplierCode);
    payload.brandCode = normalizeCode(payload.brandCode);
    payload.brandName = normalizeText(payload.brandName);
    payload.categoryCode = normalizeText(payload.categoryCode);
    payload.packageCode = normalizeText(payload.packageCode);
    payload.packageName = normalizeText(payload.packageName);
    payload.shelfCode = normalizeCode(payload.shelfCode);
    payload.vatRatePercent = payload.vatRatePercent ?? 20;
    payload.currentCost = payload.currentCost ?? 0;
    payload.margins = Array.isArray(payload.margins) ? payload.margins : ['', '', '', '', ''];
    payload.extraUnits = Array.isArray(payload.extraUnits) ? payload.extraUnits : [];
    return payload as StockCreateInput;
  }

  private async normalizeOfferInput(request: any, input: OfferInput) {
    const supplierName = normalizeText(input.supplierName);
    const supplierCode = normalizeText(input.supplierCode) || null;
    if (!supplierCode && !supplierName) throw new AppError('Tedarikci zorunludur.', 400, ErrorCode.BAD_REQUEST);
    const currency = normalizeCode(input.currency) || 'TRY';
    const exchangeRate = currency === 'TRY' ? null : asNumber(input.exchangeRate, 0);
    if (currency !== 'TRY' && (!exchangeRate || exchangeRate <= 0)) {
      throw new AppError('Dovizli maliyetlerde kur zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }
    const productVat = request.type === 'EXISTING_PRODUCT'
      ? await this.resolveProductVat(request.productCode)
      : asNumber((request.stockCreatePayload as any)?.vatRatePercent, 20) / 100;
    const vatRaw = input.vatRate !== undefined && input.vatRate !== null && input.vatRate !== '' ? asNumber(input.vatRate, productVat) : productVat;
    const vatRate = vatRaw > 1 ? vatRaw / 100 : vatRaw;
    const factor = Math.max(asNumber(input.unitFactor, 1), 0.0001);
    const fx = currency === 'TRY' ? 1 : Number(exchangeRate);
    const divider = input.vatIncluded ? 1 + vatRate : 1;
    let costT = asNumber(input.costT, 0);
    let costP = asNumber(input.costP, 0);
    if ((!costP || costP <= 0) && costT > 0) {
      costP = roundMoney(costT * (1 + Math.max(vatRate, 0) / 2));
    }
    if ((!costT || costT <= 0) && costP > 0) {
      costT = costP;
    }
    if (!costT || costT <= 0) throw new AppError('Maliyet T zorunludur.', 400, ErrorCode.BAD_REQUEST);
    if (!costP || costP <= 0) throw new AppError('Maliyet P zorunludur.', 400, ErrorCode.BAD_REQUEST);

    return {
      supplierCode,
      supplierName: supplierName || supplierCode || 'Tedarikci',
      supplierProductCode: normalizeText(input.supplierProductCode) || null,
      costP,
      costT,
      currency,
      exchangeRate,
      vatIncluded: Boolean(input.vatIncluded),
      vatRate,
      unit: normalizeText(input.unit) || request.unit || null,
      unitFactor: factor,
      normalizedCostP: roundMoney((costP * fx) / factor / divider),
      normalizedCostT: roundMoney((costT * fx) / factor / divider),
      minOrderQuantity: input.minOrderQuantity !== undefined && input.minOrderQuantity !== null && input.minOrderQuantity !== '' ? asNumber(input.minOrderQuantity, 0) : null,
      leadTimeDays: input.leadTimeDays !== undefined && input.leadTimeDays !== null && input.leadTimeDays !== '' ? Math.trunc(asNumber(input.leadTimeDays, 0)) : null,
      validUntil: toDateOrNull(input.validUntil),
      quoteDate: toDateOrNull(input.quoteDate) || new Date(),
      note: normalizeText(input.note) || null,
      attachmentUrl: normalizeText(input.attachmentUrl) || null,
    };
  }

  private async resolveProductVat(productCode?: string | null) {
    const code = normalizeCode(productCode);
    if (!code) return 0.2;
    const product = await prisma.product.findFirst({ where: { mikroCode: code }, select: { vatRate: true } });
    return Number(product?.vatRate ?? 0.2);
  }

  private async addSystemNote(requestId: string, body: string, authorId?: string | null) {
    const userInfo = await this.resolveUser(authorId || null);
    await prisma.priceVerificationNote.create({
      data: {
        requestId,
        authorId: authorId || null,
        authorName: userInfo.userName || 'Sistem',
        body,
        visibility: 'INTERNAL',
      },
    }).catch(() => undefined);
  }

  private async mapRequestWithProductMeta(request: any) {
    const [mapped] = await this.mapRequestsWithProductMeta([request]);
    return mapped;
  }

  private async mapRequestsWithProductMeta(requests: any[]) {
    const codes = Array.from(new Set(
      requests
        .map((request) => normalizeCode(request?.productCode))
        .filter(Boolean)
    ));
    const products = codes.length
      ? await prisma.product.findMany({
          where: { mikroCode: { in: codes } },
          select: { mikroCode: true, unit: true, vatRate: true },
        })
      : [];
    const productMeta = new Map(products.map((product) => [normalizeCode(product.mikroCode), product]));
    return requests.map((request) => this.mapRequest(request, productMeta));
  }

  private mapRequest(request: any, productMeta?: Map<string, { mikroCode: string; unit: string; vatRate: number | null }>) {
    const product = productMeta?.get(normalizeCode(request.productCode));
    const stockPayload = request.stockCreatePayload || null;
    const stockVatPercent = asNumber((stockPayload as any)?.vatRatePercent, 0);
    const vatRate = product?.vatRate ?? (stockVatPercent > 0 ? stockVatPercent / 100 : null);
    const unit = request.unit || product?.unit || (stockPayload as any)?.mainUnit || null;
    const offers = (request.offers || []).map((offer: any) => ({
      ...offer,
      isSelected: request.selectedOfferId === offer.id,
    }));
    const bestOffer = offers.length ? offers.reduce((best: any, offer: any) => (Number(offer.normalizedCostP) < Number(best.normalizedCostP) ? offer : best), offers[0]) : null;
    const availableActions = this.getAvailableActions(request);
    return {
      ...request,
      unit,
      vatRate,
      vatRatePercent: vatRate !== null && vatRate !== undefined ? (vatRate > 1 ? vatRate : vatRate * 100) : null,
      offers,
      bestOffer,
      availableActions,
      stockCreatePayload: stockPayload,
      notes: request.notes || [],
    };
  }

  private getAvailableActions(request: any) {
    return {
      canAddOffer: !['COMPLETED', 'CANCELLED'].includes(request.status),
      canSendToSales: ['REQUESTED', 'IN_REVIEW', 'SALES_REJECTED'].includes(request.status) && (request.offers?.length || 0) > 0,
      canSalesDecide: request.status === 'SENT_TO_SALES',
      canComplete: request.status === 'SALES_APPROVED' && Boolean(request.selectedOfferId),
      canCancel: !['COMPLETED', 'CANCELLED'].includes(request.status),
    };
  }
}

export default new PriceVerificationService();
