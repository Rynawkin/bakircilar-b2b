import { OrderStatus, QuoteStatus, UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 50;

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

type ActionRadarContext = {
  userId?: string | null;
  role?: string | null;
  assignedSectorCodes?: string[] | null;
};

const cleanSectorCodes = (codes?: string[] | null) =>
  Array.from(new Set((codes || []).map((code) => String(code || '').trim()).filter(Boolean)));

class ActionRadarService {
  async getSnapshot(context: ActionRadarContext = {}) {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - DAY_MS);
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);
    const validitySoon = new Date(now.getTime() + 3 * DAY_MS);
    const isSalesRep = context.role === UserRole.SALES_REP;
    const sectorCodes = isSalesRep ? cleanSectorCodes(context.assignedSectorCodes) : [];
    const emptyScope = isSalesRep && sectorCodes.length === 0;
    const customerSectorWhere: any = emptyScope ? { id: '__none__' } : isSalesRep ? { sectorCode: { in: sectorCodes } } : {};
    const quoteCustomerWhere: any = emptyScope ? { customer: { id: '__none__' } } : isSalesRep ? { customer: { sectorCode: { in: sectorCodes } } } : {};
    const scopedCustomerUserWhere: any = {
      role: UserRole.CUSTOMER,
      OR: [{ sectorCode: { in: sectorCodes } }, { parentCustomer: { sectorCode: { in: sectorCodes } } }],
    };
    const scopedOrderUserWhere: any = {
      OR: [{ sectorCode: { in: sectorCodes } }, { parentCustomer: { sectorCode: { in: sectorCodes } } }],
    };
    const orderUserWhere: any = emptyScope ? { user: { id: '__none__' } } : isSalesRep ? { user: scopedOrderUserWhere } : {};
    const cartUserWhere: any = emptyScope
      ? { user: { id: '__none__' } }
      : isSalesRep
        ? { user: scopedCustomerUserWhere }
        : { user: { role: UserRole.CUSTOMER } };
    const missingImageWhere: any = { active: true, OR: [{ imageUrl: null }, { imageUrl: '' }] };
    const invalidUnitWhere: any = {
      active: true,
      unit2: { not: null },
      OR: [{ unit2Factor: null }, { unit2Factor: { lte: 0 } }],
    };
    const invalidVatWhere: any = { active: true, OR: [{ vatRate: { lte: 0 } }, { vatRate: { gt: 0.3 } }] };
    const quoteRiskWhere: any = {
      ...quoteCustomerWhere,
      status: { in: [QuoteStatus.PENDING_APPROVAL, QuoteStatus.SENT_TO_MIKRO] },
      OR: [{ validityDate: { lt: now } }, { validityDate: { lte: validitySoon } }],
    };
    const abandonedCartWhere: any = {
      ...cartUserWhere,
      updatedAt: { lte: oneDayAgo },
      items: { some: {} },
    };

    const [
      quoteStats,
      quoteRiskTotal,
      quoteRisks,
      abandonedCartTotal,
      abandonedCarts,
      complementStats,
      activeProducts,
      missingImageTotal,
      missingImageProducts,
      missingCategoryProducts,
      invalidUnitTotal,
      invalidUnitProducts,
      invalidVatTotal,
      invalidVatProducts,
      galleryImages,
      bundleProducts,
      bundleOrderGroups,
      bundleSuggestionRows,
      fieldVisitCandidates,
      anomalyInputs,
    ] = await Promise.all([
      prisma.quote.groupBy({
        by: ['status'],
        where: { createdAt: { gte: ninetyDaysAgo }, ...quoteCustomerWhere },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      prisma.quote.count({ where: quoteRiskWhere }),
      prisma.quote.findMany({
        where: quoteRiskWhere,
        orderBy: [{ validityDate: 'asc' }, { createdAt: 'desc' }],
        take: LIST_LIMIT,
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          grandTotal: true,
          validityDate: true,
          customer: { select: { mikroCariCode: true, displayName: true, name: true, sectorCode: true } },
          createdBy: { select: { name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.cart.count({ where: abandonedCartWhere }),
      prisma.cart.findMany({
        where: abandonedCartWhere,
        orderBy: { updatedAt: 'asc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          updatedAt: true,
          user: { select: { id: true, mikroCariCode: true, displayName: true, name: true, sectorCode: true } },
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              updatedAt: true,
              product: { select: { mikroCode: true, name: true } },
            },
          },
        },
      }),
      Promise.all([
        prisma.product.count({ where: { active: true } }),
        prisma.productComplementAuto.count(),
        prisma.productComplementManual.count(),
        prisma.product.count({
          where: {
            active: true,
            complementMode: 'AUTO',
            complementAuto: { none: {} },
          },
        }),
      ]),
      prisma.product.count({ where: { active: true } }),
      prisma.product.count({ where: missingImageWhere }),
      prisma.product.findMany({
        where: missingImageWhere,
        orderBy: { popularSalesValue: 'desc' },
        take: LIST_LIMIT,
        select: { id: true, mikroCode: true, name: true, popularSalesValue: true },
      }),
      Promise.resolve([] as Array<{ id: string; mikroCode: string; name: string }>),
      prisma.product.count({ where: invalidUnitWhere }),
      prisma.product.findMany({
        where: invalidUnitWhere,
        take: LIST_LIMIT,
        select: { id: true, mikroCode: true, name: true, unit2: true, unit2Factor: true },
      }),
      prisma.product.count({ where: invalidVatWhere }),
      prisma.product.findMany({
        where: invalidVatWhere,
        take: LIST_LIMIT,
        select: { id: true, mikroCode: true, name: true, vatRate: true },
      }),
      prisma.productImage.groupBy({ by: ['productId'], _count: { _all: true } }),
      prisma.product.findMany({
        where: { isBundle: true },
        select: { id: true, mikroCode: true, name: true, active: true, hiddenFromCustomers: true, bundleItems: { select: { id: true } } },
      }),
      prisma.orderItem.groupBy({
        by: ['lineNote'],
        where: {
          lineNote: { startsWith: 'SET:' },
          order: { status: OrderStatus.APPROVED, createdAt: { gte: ninetyDaysAgo } },
        },
        _count: { _all: true },
        _sum: { totalPrice: true, quantity: true },
      }),
      prisma.productComplementAuto.findMany({
        orderBy: [{ pairCount: 'desc' }, { rank: 'asc' }],
        take: LIST_LIMIT,
        select: {
          pairCount: true,
          product: { select: { id: true, mikroCode: true, name: true, imageUrl: true } },
          relatedProduct: { select: { id: true, mikroCode: true, name: true, imageUrl: true } },
        },
      }),
      prisma.user.findMany({
        where: {
          ...customerSectorWhere,
          role: UserRole.CUSTOMER,
          parentCustomerId: null,
          active: true,
          OR: [
            { lastLoginAt: null },
            { lastLoginAt: { lt: thirtyDaysAgo } },
            { cart: { updatedAt: { lte: oneDayAgo }, items: { some: {} } } },
            { vadeBalance: { pastDueBalance: { gt: 100 } } },
          ],
        },
        orderBy: [{ balance: 'desc' }, { lastLoginAt: 'asc' }],
        take: LIST_LIMIT,
        select: {
          id: true,
          mikroCariCode: true,
          displayName: true,
          name: true,
          sectorCode: true,
          lastLoginAt: true,
          balance: true,
          cart: { select: { updatedAt: true, items: { select: { quantity: true, unitPrice: true } } } },
          vadeBalance: { select: { pastDueBalance: true, totalBalance: true } },
        },
      }),
      Promise.all([
        prisma.quote.count({ where: { ...quoteCustomerWhere, validityDate: { lt: now }, status: { in: [QuoteStatus.PENDING_APPROVAL, QuoteStatus.SENT_TO_MIKRO] } } }),
        prisma.order.count({ where: { ...orderUserWhere, status: OrderStatus.PENDING, createdAt: { lt: sevenDaysAgo } } }),
        prisma.cart.count({ where: { ...cartUserWhere, updatedAt: { lt: new Date(now.getTime() - 14 * DAY_MS) }, items: { some: {} } } }),
      ]),
    ]);

    const quoteSummary = quoteStats.reduce(
      (acc, row) => {
        acc.total += row._count._all;
        acc.amount += toNumber(row._sum.grandTotal);
        if (row.status === QuoteStatus.PENDING_APPROVAL) acc.pending += row._count._all;
        if (row.status === QuoteStatus.SENT_TO_MIKRO) acc.sent += row._count._all;
        if (row.status === QuoteStatus.CUSTOMER_ACCEPTED) acc.accepted += row._count._all;
        if (row.status === QuoteStatus.REJECTED) acc.rejected += row._count._all;
        return acc;
      },
      { total: 0, amount: 0, pending: 0, sent: 0, accepted: 0, rejected: 0 }
    );

    const cartRows = abandonedCarts.map((cart) => {
      const total = cart.items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice), 0);
      const daysIdle = Math.max(Math.floor((now.getTime() - new Date(cart.updatedAt).getTime()) / DAY_MS), 0);
      return {
        cartId: cart.id,
        customerId: cart.user.id,
        customerCode: cart.user.mikroCariCode || cart.user.id,
        customerName: cart.user.displayName || cart.user.name || cart.user.mikroCariCode || cart.user.id,
        sectorCode: cart.user.sectorCode || null,
        updatedAt: cart.updatedAt,
        daysIdle,
        itemCount: cart.items.length,
        totalAmount: round2(total),
        firstItems: cart.items.slice(0, 4).map((item) => ({
          productCode: item.product.mikroCode,
          productName: item.product.name,
          quantity: item.quantity,
        })),
        actionUrl: `/reports/customer-carts?search=${encodeURIComponent(cart.user.mikroCariCode || cart.user.id)}`,
      };
    });

    const [productCount, autoCount, manualCount, productsWithoutComplements] = complementStats;
    const missingImageCount = missingImageTotal;
    const missingCategoryCount = missingCategoryProducts.length;
    const invalidUnitCount = invalidUnitTotal;
    const invalidVatCount = invalidVatTotal;
    const productsWithGallery = galleryImages.length;
    const catalogPenalty =
      Math.min(missingImageCount, 150) * 0.18 +
      Math.min(missingCategoryCount, 100) * 0.25 +
      Math.min(invalidUnitCount, 80) * 0.45 +
      Math.min(invalidVatCount, 80) * 0.6;

    return {
      generatedAt: now.toISOString(),
      scope: {
        mode: isSalesRep ? 'assigned-sectors' : 'all',
        sectorCodes,
      },
      quoteHealth: {
        summary: {
          ...quoteSummary,
          amount: round2(quoteSummary.amount),
          expiringOrExpired: quoteRiskTotal,
          shownRows: quoteRisks.length,
        },
        rows: quoteRisks.map((quote) => ({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          status: quote.status,
          grandTotal: round2(toNumber(quote.grandTotal)),
          validityDate: quote.validityDate,
          itemCount: quote._count.items,
          customerCode: quote.customer.mikroCariCode,
          customerName: quote.customer.displayName || quote.customer.name || quote.customer.mikroCariCode,
          sectorCode: quote.customer.sectorCode,
          createdByName: quote.createdBy.name || quote.createdBy.email,
          issue: quote.validityDate < now ? 'Suresi gecmis teklif' : 'Suresi 3 gun icinde doluyor',
          actionUrl: `/quotes?search=${encodeURIComponent(quote.quoteNumber)}`,
        })),
      },
      abandonedCarts: {
        summary: {
          total: abandonedCartTotal,
          shownRows: cartRows.length,
          totalAmount: round2(cartRows.reduce((sum, row) => sum + row.totalAmount, 0)),
          over7Days: cartRows.filter((row) => row.daysIdle >= 7).length,
        },
        rows: cartRows,
      },
      complementHealth: {
        summary: {
          activeProducts: productCount,
          autoRecommendations: autoCount,
          manualRecommendations: manualCount,
          productsWithoutComplements,
          coveragePct: productCount ? Math.round(((productCount - productsWithoutComplements) / productCount) * 100) : 0,
        },
      },
      imageQuality: {
        summary: {
          activeProducts,
          missingImageCount,
          galleryProductCount: productsWithGallery,
          galleryCoveragePct: activeProducts ? Math.round((productsWithGallery / activeProducts) * 100) : 0,
        },
        missingImageProducts: missingImageProducts.map((product) => ({
          ...product,
          actionUrl: `/admin-products?search=${encodeURIComponent(product.mikroCode)}`,
          imageIssueUrl: `/warehouse/image-issues?search=${encodeURIComponent(product.mikroCode)}`,
        })),
      },
      bundlePerformance: {
        summary: {
          bundleCount: bundleProducts.length,
          activeBundleCount: bundleProducts.filter((bundle) => bundle.active && !bundle.hiddenFromCustomers).length,
          incompleteBundleCount: bundleProducts.filter((bundle) => bundle.bundleItems.length === 0).length,
          orderedBundleLines90d: bundleOrderGroups.reduce((sum, row) => sum + row._count._all, 0),
        },
        rows: bundleOrderGroups
          .sort((a, b) => b._count._all - a._count._all)
          .slice(0, 15)
          .map((row) => ({
          bundleName: String(row.lineNote || '').replace(/^SET:\s*/i, ''),
          lineCount: row._count._all,
          quantity: round2(toNumber(row._sum.quantity)),
          amount: round2(toNumber(row._sum.totalPrice)),
        })),
      },
      bundleSuggestions: {
        rows: bundleSuggestionRows.map((row) => ({
          score: row.pairCount,
          title: `${row.product.name} + ${row.relatedProduct.name}`,
          products: [
            { id: row.product.id, code: row.product.mikroCode, name: row.product.name, imageUrl: row.product.imageUrl },
            { id: row.relatedProduct.id, code: row.relatedProduct.mikroCode, name: row.relatedProduct.name, imageUrl: row.relatedProduct.imageUrl },
          ],
          reason: `${row.pairCount} ortak evrakta birlikte alindi`,
        })),
      },
      catalogScore: {
        summary: {
          activeProducts,
          score: Math.max(0, Math.min(100, Math.round(100 - catalogPenalty))),
          missingImageCount,
          missingCategoryCount,
          invalidUnitCount,
          invalidVatCount,
        },
        samples: {
          missingImages: missingImageProducts,
          missingCategories: missingCategoryProducts,
          invalidUnits: invalidUnitProducts,
          invalidVat: invalidVatProducts,
        },
      },
      fieldVisitPlanner: {
        rows: fieldVisitCandidates.map((customer) => {
          const cartAmount = customer.cart?.items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice), 0) || 0;
          const pastDue = toNumber(customer.vadeBalance?.pastDueBalance);
          const lastLoginDays = customer.lastLoginAt
            ? Math.floor((now.getTime() - new Date(customer.lastLoginAt).getTime()) / DAY_MS)
            : null;
          const priorityScore = Math.round(
            Math.min(pastDue / 1000, 40) +
              Math.min(cartAmount / 1000, 25) +
              (lastLoginDays == null ? 20 : Math.min(lastLoginDays, 30) * 0.5) +
              Math.min(Math.max(toNumber(customer.balance), 0) / 5000, 15)
          );
          return {
            customerId: customer.id,
            customerCode: customer.mikroCariCode || customer.id,
            customerName: customer.displayName || customer.name || customer.mikroCariCode || customer.id,
            sectorCode: customer.sectorCode,
            lastLoginAt: customer.lastLoginAt,
            cartAmount: round2(cartAmount),
            pastDueBalance: round2(pastDue),
            totalBalance: round2(toNumber(customer.vadeBalance?.totalBalance || customer.balance)),
            priorityScore,
            suggestedAction: cartAmount > 0 ? 'Sepet uzerinden teklif/arama' : pastDue > 100 ? 'Vade tahsilat ziyareti' : 'Aktivasyon ziyareti',
            actionUrl: `/field-sales?customerCode=${encodeURIComponent(customer.mikroCariCode || customer.id)}`,
            customer360Url: `/customer-360?customerCode=${encodeURIComponent(customer.mikroCariCode || customer.id)}`,
          };
        }).sort((a, b) => b.priorityScore - a.priorityScore),
      },
      anomalyRadar: {
        summary: {
          expiredOpenQuotes: anomalyInputs[0],
          stalePendingOrders: anomalyInputs[1],
          staleCarts: anomalyInputs[2],
          catalogBlockedChecks: invalidUnitCount + invalidVatCount,
        },
      },
    };
  }
}

export default new ActionRadarService();
