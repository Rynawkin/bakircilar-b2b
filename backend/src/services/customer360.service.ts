import { OrderStatus, Prisma, QuoteStatus, TaskStatus, UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError, ErrorCode } from '../types/errors';
import { matchesSearchTokens, normalizeSearchText, splitSearchTokens } from '../utils/search';

type StaffScope = {
  role?: string;
  assignedSectorCodes?: string[];
};

const CUSTOMER_SELECT = {
  id: true,
  email: true,
  name: true,
  mikroName: true,
  displayName: true,
  mikroCariCode: true,
  customerType: true,
  priceVisibility: true,
  vatDisplayPreference: true,
  useLastPrices: true,
  lastPriceGuardType: true,
  lastPriceGuardInvoicedListNo: true,
  lastPriceGuardWhiteListNo: true,
  lastPriceCostBasis: true,
  lastPriceMinCostPercent: true,
  // Fiyat listesi onerisi (gece motoru) + manuel override alanlari
  suggestedInvoicedListNo: true,
  suggestedRetailListNo: true,
  suggestedListBasis: true,
  suggestedListComputedAt: true,
  manualInvoicedListNo: true,
  manualRetailListNo: true,
  manualListNote: true,
  active: true,
  city: true,
  district: true,
  phone: true,
  isLocked: true,
  groupCode: true,
  sectorCode: true,
  paymentTerm: true,
  paymentPlanNo: true,
  paymentPlanCode: true,
  paymentPlanName: true,
  hasEInvoice: true,
  balance: true,
  balanceUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const displayName = (customer: { displayName?: string | null; mikroName?: string | null; name?: string | null; mikroCariCode?: string | null }) =>
  customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode || '-';

const countByStatus = <T extends string>(rows: Array<{ status: T; _count: { _all: number } }>) => {
  const map: Partial<Record<T, number>> = {};
  rows.forEach((row) => {
    map[row.status] = row._count._all;
  });
  return map;
};

const sumGroupAmount = <T extends string>(rows: Array<{ status: T; _sum?: { totalAmount?: number | null; grandTotal?: number | null } }>) =>
  rows.reduce((sum, row) => sum + Number(row._sum?.totalAmount ?? row._sum?.grandTotal ?? 0), 0);

class Customer360Service {
  private buildCustomerScope(scope: StaffScope): Prisma.UserWhereInput | null {
    const base: Prisma.UserWhereInput = {
      role: UserRole.CUSTOMER,
      parentCustomerId: null,
      mikroCariCode: { not: null },
    };

    if (scope.role === UserRole.SALES_REP) {
      const sectorCodes = (scope.assignedSectorCodes || []).map((code) => String(code || '').trim()).filter(Boolean);
      if (sectorCodes.length === 0) return null;
      base.sectorCode = { in: sectorCodes };
    }

    return base;
  }

  async searchCustomers(input: { search?: string; limit?: number; scope: StaffScope }) {
    const scopedWhere = this.buildCustomerScope(input.scope);
    if (!scopedWhere) return { customers: [] };

    const tokens = splitSearchTokens(input.search || '');
    const limit = Math.max(1, Math.min(Number(input.limit) || 20, 50));
    const where: Prisma.UserWhereInput = {
      AND: [
        scopedWhere,
        ...(tokens.length > 0
          ? tokens.map((token) => ({
              OR: [
                { mikroCariCode: { contains: token, mode: 'insensitive' as const } },
                { displayName: { contains: token, mode: 'insensitive' as const } },
                { mikroName: { contains: token, mode: 'insensitive' as const } },
                { name: { contains: token, mode: 'insensitive' as const } },
                { city: { contains: token, mode: 'insensitive' as const } },
                { sectorCode: { contains: token, mode: 'insensitive' as const } },
              ],
            }))
          : []),
      ],
    };

    let customers = await prisma.user.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: [{ active: 'desc' }, { mikroCariCode: 'asc' }],
      take: limit,
    });

    if (tokens.length > 0 && customers.length < limit) {
      const normalizedTokens = tokens.map((token) => normalizeSearchText(token)).filter(Boolean);
      const fallbackRows = await prisma.user.findMany({
        where: scopedWhere,
        select: CUSTOMER_SELECT,
        orderBy: [{ active: 'desc' }, { mikroCariCode: 'asc' }],
        take: 1000,
      });
      const seen = new Set(customers.map((customer) => customer.id));
      const fallbackMatches = fallbackRows
        .filter((customer) => !seen.has(customer.id))
        .filter((customer) => {
          const haystack = normalizeSearchText([
            customer.mikroCariCode,
            customer.displayName,
            customer.mikroName,
            customer.name,
            customer.city,
            customer.sectorCode,
          ].filter(Boolean).join(' '));
          return matchesSearchTokens(haystack, normalizedTokens);
        });
      customers = [...customers, ...fallbackMatches].slice(0, limit);
    }

    return {
      customers: customers.map((customer) => ({
        ...customer,
        displayTitle: displayName(customer),
      })),
    };
  }

  async getCustomer360(input: { customerIdOrCode: string; scope: StaffScope }) {
    const scopedWhere = this.buildCustomerScope(input.scope);
    if (!scopedWhere) {
      throw new AppError('Bu cariye erisim yetkiniz yok.', 403, ErrorCode.FORBIDDEN);
    }

    const key = String(input.customerIdOrCode || '').trim();
    if (!key) {
      throw new AppError('Cari secimi zorunludur.', 400, ErrorCode.BAD_REQUEST);
    }

    const customer = await prisma.user.findFirst({
      where: {
        AND: [
          scopedWhere,
          {
            OR: [
              { id: key },
              { mikroCariCode: key.toUpperCase() },
            ],
          },
        ],
      },
      select: CUSTOMER_SELECT,
    });

    if (!customer) {
      throw new AppError('Cari bulunamadi veya erisim yetkiniz yok.', 404, ErrorCode.NOT_FOUND);
    }

    const customerId = customer.id;
    const customerCode = String(customer.mikroCariCode || '').trim().toUpperCase();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const openTaskStatuses = [
      TaskStatus.NEW,
      TaskStatus.TRIAGE,
      TaskStatus.IN_PROGRESS,
      TaskStatus.WAITING,
      TaskStatus.REVIEW,
    ];

    const [
      orderGroups,
      recentOrders,
      quoteGroups,
      recentQuotes,
      cart,
      taskCounts,
      recentTasks,
      vadeBalance,
      vadeNotes,
      vadeClassification,
      vadeAssignments,
      recoveryActions,
      recoveryActionCount,
      activityEvents,
      activeAgreements,
      recentAgreements,
      contacts,
      subUsers,
      invoiceCount,
      recentInvoices,
      customerRequests,
      engagementLogs,
    ] = await Promise.all([
      prisma.order.groupBy({
        by: ['status'],
        where: { userId: customerId },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      prisma.order.findMany({
        where: { userId: customerId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          customerOrderNumber: true,
          status: true,
          totalAmount: true,
          mikroOrderIds: true,
          createdAt: true,
          approvedAt: true,
          rejectedAt: true,
          _count: { select: { items: true } },
          sourceQuote: { select: { id: true, quoteNumber: true } },
          requestedBy: { select: { id: true, name: true, email: true } },
          items: {
            take: 5,
            orderBy: { createdAt: 'asc' },
            select: {
              mikroCode: true,
              productName: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalPrice: true,
              status: true,
            },
          },
        },
      }),
      prisma.quote.groupBy({
        by: ['status'],
        where: { customerId },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      prisma.quote.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          totalAmount: true,
          totalVat: true,
          grandTotal: true,
          validityDate: true,
          mikroNumber: true,
          createdAt: true,
          adminActionAt: true,
          customerRespondedAt: true,
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true, orders: true } },
          items: {
            take: 5,
            orderBy: { lineOrder: 'asc' },
            select: {
              productCode: true,
              productName: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalPrice: true,
              status: true,
            },
          },
        },
      }),
      prisma.cart.findUnique({
        where: { userId: customerId },
        select: {
          id: true,
          updatedAt: true,
          items: {
            orderBy: { updatedAt: 'desc' },
            take: 20,
            select: {
              id: true,
              quantity: true,
              priceType: true,
              priceMode: true,
              unitPrice: true,
              lineNote: true,
              updatedAt: true,
              product: {
                select: {
                  id: true,
                  mikroCode: true,
                  name: true,
                  imageUrl: true,
                  unit: true,
                },
              },
            },
          },
        },
      }),
      Promise.all([
        prisma.task.count({ where: { customerId } }),
        prisma.task.count({ where: { customerId, status: { in: openTaskStatuses } } }),
        prisma.task.count({
          where: {
            customerId,
            status: { in: openTaskStatuses },
            dueDate: { lt: now },
          },
        }),
      ]),
      prisma.task.findMany({
        where: { customerId },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          assignedTo: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { comments: true, attachments: true } },
        },
      }),
      prisma.vadeBalance.findUnique({ where: { userId: customerId } }),
      prisma.vadeNote.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { author: { select: { id: true, name: true, email: true } } },
      }),
      prisma.vadeClassification.findUnique({
        where: { customerId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          updatedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.vadeAssignment.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        include: {
          staff: { select: { id: true, name: true, email: true } },
          assignedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      customerCode
        ? prisma.customerRecoveryAction.findMany({
            where: { customerCode },
            orderBy: { createdAt: 'desc' },
            take: 8,
            include: {
              author: { select: { id: true, name: true, email: true } },
              assignedTo: { select: { id: true, name: true, email: true } },
            },
          })
        : Promise.resolve([]),
      customerCode
        ? prisma.customerRecoveryAction.count({ where: { customerCode, status: 'OPEN' } })
        : Promise.resolve(0),
      prisma.customerActivityEvent.findMany({
        where: {
          customerId,
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          type: true,
          pagePath: true,
          pageTitle: true,
          productCode: true,
          product: { select: { mikroCode: true, name: true } },
          quantity: true,
          durationSeconds: true,
          clickCount: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.customerPriceAgreement.count({
        where: {
          customerId,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        },
      }),
      prisma.customerPriceAgreement.findMany({
        where: {
          customerId,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          priceInvoiced: true,
          priceWhite: true,
          customerProductCode: true,
          minQuantity: true,
          validFrom: true,
          validTo: true,
          product: { select: { mikroCode: true, name: true, unit: true } },
        },
      }),
      prisma.customerContact.findMany({
        where: { customerId },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.user.findMany({
        where: { parentCustomerId: customerId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          active: true,
          priceVisibility: true,
          createdAt: true,
        },
      }),
      prisma.eInvoiceDocument.count({
        where: { OR: [{ customerId }, ...(customerCode ? [{ customerCode }] : [])] },
      }),
      prisma.eInvoiceDocument.findMany({
        where: { OR: [{ customerId }, ...(customerCode ? [{ customerCode }] : [])] },
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        select: {
          id: true,
          invoiceNo: true,
          issueDate: true,
          totalAmount: true,
          currency: true,
          matchStatus: true,
        },
      }),
      prisma.customerRequest.findMany({
        where: { parentCustomerId: customerId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          status: true,
          note: true,
          createdAt: true,
          convertedAt: true,
          requestedBy: { select: { id: true, name: true, email: true } },
          order: { select: { id: true, orderNumber: true, status: true } },
          _count: { select: { items: true } },
        },
      }),
      customerCode
        ? prisma.customerContactLog.findMany({
            where: { customerCode },
            orderBy: { contactedAt: 'desc' },
            take: 8,
          })
        : Promise.resolve([]),
    ]);

    const orderStatusCounts = countByStatus(orderGroups);
    const quoteStatusCounts = countByStatus(quoteGroups);
    const cartItems = cart?.items || [];
    const cartTotal = cartItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const activitySummary = this.buildActivitySummary(activityEvents);
    const priceTrust = this.buildPriceTrust(customer, activeAgreements);
    const lastEngagement = engagementLogs[0] || null;

    return {
      customer: {
        ...customer,
        displayTitle: displayName(customer),
      },
      summary: {
        balance: Number(customer.balance || 0),
        orderCount: orderGroups.reduce((sum, row) => sum + row._count._all, 0),
        orderAmount: sumGroupAmount(orderGroups),
        pendingOrderCount: orderStatusCounts[OrderStatus.PENDING] || 0,
        approvedOrderCount: orderStatusCounts[OrderStatus.APPROVED] || 0,
        rejectedOrderCount: orderStatusCounts[OrderStatus.REJECTED] || 0,
        quoteCount: quoteGroups.reduce((sum, row) => sum + row._count._all, 0),
        quoteAmount: sumGroupAmount(quoteGroups),
        pendingQuoteCount: quoteStatusCounts[QuoteStatus.PENDING_APPROVAL] || 0,
        sentQuoteCount: quoteStatusCounts[QuoteStatus.SENT_TO_MIKRO] || 0,
        acceptedQuoteCount: quoteStatusCounts[QuoteStatus.CUSTOMER_ACCEPTED] || 0,
        cartItemCount: cartItems.length,
        cartTotal,
        taskCount: taskCounts[0],
        openTaskCount: taskCounts[1],
        overdueTaskCount: taskCounts[2],
        openRecoveryActionCount: recoveryActionCount,
        activeAgreementCount: activeAgreements,
        invoiceCount,
        lastActivityAt: activityEvents[0]?.createdAt || null,
        activityEventCount30d: activityEvents.length,
      },
      vade: {
        balance: vadeBalance || null,
        classification: vadeClassification || null,
        assignments: vadeAssignments,
        notes: vadeNotes,
      },
      orders: recentOrders,
      quotes: recentQuotes,
      cart: cart
        ? {
            id: cart.id,
            updatedAt: cart.updatedAt,
            total: cartTotal,
            items: cartItems,
          }
        : null,
      tasks: recentTasks,
      recoveryActions,
      activity: activitySummary,
      engagement: {
        lastContactAt: lastEngagement?.contactedAt || null,
        lastContactByName: lastEngagement?.contactedByName || null,
        lastOutcome: lastEngagement?.outcome || null,
        nextFollowUpDate: lastEngagement?.followUpDate || null,
        contactCount: engagementLogs.length,
        recentContacts: engagementLogs,
      },
      agreements: {
        activeCount: activeAgreements,
        recent: recentAgreements,
      },
      priceTrust,
      contacts,
      subUsers,
      invoices: {
        count: invoiceCount,
        recent: recentInvoices,
      },
      orderRequests: customerRequests,
    };
  }

  private buildActivitySummary(events: any[]) {
    const byType = new Map<string, number>();
    const pages = new Map<string, { pagePath: string; pageTitle: string | null; count: number }>();
    const products = new Map<string, { productCode: string; productName: string | null; count: number }>();

    events.forEach((event) => {
      const type = String(event.type || 'UNKNOWN');
      byType.set(type, (byType.get(type) || 0) + 1);

      const pagePath = String(event.pagePath || '').trim();
      if (pagePath) {
        const current = pages.get(pagePath) || { pagePath, pageTitle: event.pageTitle || null, count: 0 };
        current.count += 1;
        if (!current.pageTitle && event.pageTitle) current.pageTitle = event.pageTitle;
        pages.set(pagePath, current);
      }

      const productCode = String(event.productCode || event.product?.mikroCode || '').trim().toUpperCase();
      if (productCode) {
        const current = products.get(productCode) || {
          productCode,
          productName: event.product?.name || null,
          count: 0,
        };
        current.count += 1;
        products.set(productCode, current);
      }
    });

    return {
      totalEvents: events.length,
      lastEvents: events.slice(0, 20),
      countsByType: Object.fromEntries(byType.entries()),
      topPages: Array.from(pages.values()).sort((a, b) => b.count - a.count).slice(0, 8),
      topProducts: Array.from(products.values()).sort((a, b) => b.count - a.count).slice(0, 8),
    };
  }

  private buildPriceTrust(customer: any, activeAgreementCount: number) {
    const hasManualLists = Boolean(customer.manualInvoicedListNo || customer.manualRetailListNo);
    const hasSuggestedLists = Boolean(customer.suggestedInvoicedListNo || customer.suggestedRetailListNo);
    const hasLastPriceGuard = Boolean(customer.useLastPrices);
    const hasFreshSuggestion =
      customer.suggestedListComputedAt &&
      new Date(customer.suggestedListComputedAt).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000;

    let score = 35;
    if (hasManualLists) score += 20;
    if (hasSuggestedLists) score += hasFreshSuggestion ? 20 : 12;
    if (hasLastPriceGuard) score += 15;
    if (activeAgreementCount > 0) score += 10;
    if (!customer.priceVisibility) score -= 10;
    score = Math.max(0, Math.min(100, score));

    const warnings: string[] = [];
    if (!hasManualLists && !hasSuggestedLists) warnings.push('Liste onerisi veya manuel fiyat listesi yok');
    if (!hasLastPriceGuard) warnings.push('Son fiyat korumasi kapali');
    if (hasSuggestedLists && !hasFreshSuggestion) warnings.push('Fiyat listesi onerisi 30 gunden eski');

    return {
      score,
      level: score >= 80 ? 'HIGH' : score >= 55 ? 'MEDIUM' : 'LOW',
      priceVisibility: customer.priceVisibility,
      vatDisplayPreference: customer.vatDisplayPreference,
      useLastPrices: customer.useLastPrices,
      lastPriceGuardType: customer.lastPriceGuardType,
      lastPriceCostBasis: customer.lastPriceCostBasis,
      lastPriceMinCostPercent: customer.lastPriceMinCostPercent,
      lastPriceGuardInvoicedListNo: customer.lastPriceGuardInvoicedListNo,
      lastPriceGuardWhiteListNo: customer.lastPriceGuardWhiteListNo,
      manualInvoicedListNo: customer.manualInvoicedListNo,
      manualRetailListNo: customer.manualRetailListNo,
      manualListNote: customer.manualListNote,
      suggestedInvoicedListNo: customer.suggestedInvoicedListNo,
      suggestedRetailListNo: customer.suggestedRetailListNo,
      suggestedListBasis: customer.suggestedListBasis,
      suggestedListComputedAt: customer.suggestedListComputedAt,
      activeAgreementCount,
      warnings,
    };
  }
}

export default new Customer360Service();
