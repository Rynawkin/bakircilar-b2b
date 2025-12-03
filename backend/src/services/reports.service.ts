/**
 * Reports Service
 *
 * Raporları PostgreSQL'den (senkronize edilmiş verilerden) üretir.
 * Mikro'ya her seferinde bağlanmaya gerek yok, sabah sync'te çekilen veriler kullanılır.
 */

import { prisma } from '../utils/prisma';

interface CostUpdateAlert {
  productCode: string;
  productName: string;
  category: string;
  currentCostDate: Date | null;
  currentCost: number;
  lastEntryDate: Date | null;
  lastEntryCost: number;
  diffAmount: number;
  diffPercent: number;
  dayDiff: number;
  stockQuantity: number;
  riskAmount: number;
  salePrice: number;
}

interface CostUpdateAlertResponse {
  products: CostUpdateAlert[];
  summary: {
    totalAlerts: number;
    totalRiskAmount: number;
    totalStockValue: number;
    avgDiffPercent: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    lastSyncAt: Date | null;
    syncType: string | null;
  };
}

// Margin Compliance types
interface MarginComplianceAlert {
  productCode: string;
  productName: string;
  category: string;
  currentCost: number;
  customerType: string;
  expectedMargin: number; // % (e.g., 15 for 15%)
  expectedPrice: number;
  actualPrice: number;
  deviation: number; // % deviation
  deviationAmount: number; // TL deviation
  status: 'OK' | 'HIGH' | 'LOW'; // OK: ±2%, HIGH: >2%, LOW: <-2%
  priceSource: 'CATEGORY_RULE' | 'PRODUCT_OVERRIDE';
}

interface MarginComplianceResponse {
  alerts: MarginComplianceAlert[];
  summary: {
    totalProducts: number;
    compliantCount: number;
    highDeviationCount: number;
    lowDeviationCount: number;
    avgDeviation: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    lastSyncAt: Date | null;
    syncType: string | null;
  };
}

export class ReportsService {
  /**
   * Maliyet Güncelleme Uyarıları Raporu
   *
   * Son giriş maliyeti güncel maliyetten yüksek olan ürünleri listeler.
   * Veriler sabah sync'te PostgreSQL'e çekilir, buradan okunur.
   */
  async getCostUpdateAlerts(options: {
    dayDiff?: number;
    percentDiff?: number;
    category?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<CostUpdateAlertResponse> {
    const {
      dayDiff = 0,
      percentDiff = 0,
      category,
      page = 1,
      limit = 50,
      sortBy = 'riskAmount',
      sortOrder = 'desc',
    } = options;

    const offset = (page - 1) * limit;

    // WHERE koşulları
    const where: any = {
      active: true,
      lastEntryDate: { not: null },
      lastEntryPrice: { not: null },
      currentCost: { not: null },
      currentCostDate: { not: null },
    };

    // Kategori filtresi
    if (category) {
      where.category = {
        mikroCode: category,
      };
    }

    // Ürünleri çek
    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
      },
      skip: offset,
      take: limit + 1000, // Daha fazla çek, filtrelemeler sonrası limit'e kes
    });

    // Filtreleme ve hesaplama
    const alerts: CostUpdateAlert[] = [];

    for (const product of products) {
      const currentCost = product.currentCost || 0;
      const lastEntryPrice = product.lastEntryPrice || 0;
      const currentCostDate = product.currentCostDate;
      const lastEntryDate = product.lastEntryDate;

      // Son giriş maliyeti güncel maliyetten yüksek mi?
      if (lastEntryPrice <= currentCost) continue;

      // Son giriş tarihi güncel maliyet tarihinden sonra mı?
      if (!currentCostDate || !lastEntryDate) continue;
      if (lastEntryDate <= currentCostDate) continue;

      // Gün farkı
      const dayDifference = Math.floor(
        (lastEntryDate.getTime() - currentCostDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Gün farkı filtresi
      if (dayDiff > 0 && dayDifference < dayDiff) continue;

      // Fark hesaplama
      const diffAmount = lastEntryPrice - currentCost;
      const diffPercent = (diffAmount / currentCost) * 100;

      // Yüzde farkı filtresi
      if (percentDiff > 0 && diffPercent < percentDiff) continue;

      // Toplam stok (tüm depolar)
      const warehouseStocks = product.warehouseStocks as Record<string, number>;
      const stockQuantity = Object.values(warehouseStocks).reduce((sum, qty) => sum + qty, 0);

      // Risk tutarı
      const riskAmount = diffAmount * stockQuantity;

      // Satış fiyatı (faturalı bayi fiyatı varsayılan)
      const prices = product.prices as any;
      const salePrice = prices?.BAYI?.INVOICED || prices?.PERAKENDE?.INVOICED || currentCost * 1.3;

      alerts.push({
        productCode: product.mikroCode,
        productName: product.name,
        category: product.category.name,
        currentCostDate,
        currentCost,
        lastEntryDate,
        lastEntryCost: lastEntryPrice,
        diffAmount,
        diffPercent,
        dayDiff: dayDifference,
        stockQuantity,
        riskAmount,
        salePrice,
      });
    }

    // Sıralama
    alerts.sort((a, b) => {
      const aValue = (a as any)[sortBy] || 0;
      const bValue = (b as any)[sortBy] || 0;
      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    // Pagination
    const totalRecords = alerts.length;
    const paginatedAlerts = alerts.slice(0, limit);
    const totalPages = Math.ceil(totalRecords / limit);

    // Summary hesaplama
    const totalRiskAmount = alerts.reduce((sum, a) => sum + a.riskAmount, 0);
    const totalStockValue = alerts.reduce((sum, a) => sum + a.stockQuantity * a.currentCost, 0);
    const avgDiffPercent = alerts.length > 0
      ? alerts.reduce((sum, a) => sum + a.diffPercent, 0) / alerts.length
      : 0;

    // Son senkronizasyon bilgisini al
    const lastSync = await prisma.syncLog.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { completedAt: 'desc' },
      select: {
        completedAt: true,
        syncType: true,
      },
    });

    return {
      products: paginatedAlerts,
      summary: {
        totalAlerts: totalRecords,
        totalRiskAmount,
        totalStockValue,
        avgDiffPercent,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
      metadata: {
        lastSyncAt: lastSync?.completedAt || null,
        syncType: lastSync?.syncType || null,
      },
    };
  }

  /**
   * Rapor kategorilerini döndür
   */
  async getReportCategories(): Promise<{ categories: string[] }> {
    const categories = await prisma.category.findMany({
      where: { active: true },
      select: { mikroCode: true, name: true },
      orderBy: { name: 'asc' },
    });

    return {
      categories: categories.map((c) => c.mikroCode),
    };
  }

  /**
   * Marj Uyumsuzluğu Raporu
   *
   * Mikro'daki fiyat listelerinden (F1-F5) gerçek marjları alır ve gösterir.
   * Marj = Fiyat / Maliyet (çarpan olarak)
   *
   * Bu rapor, Mikro'daki fiyat listelerindeki marjları (STOK_SATIS_FIYAT_LISTELERI)
   * mevcut satış fiyatlarıyla karşılaştırır.
   */
  async getMarginComplianceReport(options: {
    customerType?: string; // BAYI, PERAKENDE, VIP, OZEL
    category?: string; // kategori kodu
    status?: string; // OK, HIGH, LOW, NON_COMPLIANT (HIGH | LOW)
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<MarginComplianceResponse> {
    const {
      customerType,
      category,
      status,
      page = 1,
      limit = 50,
      sortBy = 'deviation',
      sortOrder = 'desc',
    } = options;

    // WHERE koşulları
    const where: any = {
      active: true,
      currentCost: { not: null, gt: 0 },
    };

    // Kategori filtresi
    if (category) {
      where.category = {
        mikroCode: category,
      };
    }

    // Ürünleri çek
    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
      },
      take: 1000, // Limit to 1000 products for performance
    });

    // Mikro'dan fiyat listelerini çek
    const mikroService = require('./mikroFactory.service').default;
    await mikroService.connect();

    const alerts: MarginComplianceAlert[] = [];
    const customerTypes = customerType
      ? [customerType]
      : ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'];

    // Price list to customer type mapping (F1 = BAYI, F2 = PERAKENDE, etc.)
    // Bu mapping müşteri kayıtlarından alınmalı, şimdilik varsayılan
    const priceListMapping: Record<string, number> = {
      'BAYI': 1,      // F1
      'PERAKENDE': 2, // F2
      'VIP': 3,       // F3
      'OZEL': 4,      // F4
    };

    for (const product of products) {
      const currentCost = product.currentCost || 0;
      const prices = product.prices as any;

      if (!prices || currentCost === 0) continue;

      // Mikro'dan bu ürünün fiyat listelerini çek
      let mikroPrices: any[] = [];
      try {
        mikroPrices = await mikroService.executeQuery(`
          SELECT
            sfiyat_listesirano as priceListNo,
            sfiyat_fiyati as price
          FROM STOK_SATIS_FIYAT_LISTELERI
          WHERE sfiyat_stokkod = '${product.mikroCode}'
            AND sfiyat_fiyati > 0
        `);
      } catch (error) {
        console.error(`Error fetching prices for ${product.mikroCode}:`, error);
        continue;
      }

      for (const custType of customerTypes) {
        // Gerçek fiyat (faturalı fiyat) - B2B sistemindeki fiyat
        const actualPrice = prices[custType]?.INVOICED || 0;

        if (actualPrice === 0) continue;

        // Mikro'daki fiyat listesinden expected price'ı al
        const priceListNo = priceListMapping[custType];
        const mikroPrice = mikroPrices.find((p: any) => p.priceListNo === priceListNo);

        if (!mikroPrice || mikroPrice.price === 0) continue;

        const expectedPrice = mikroPrice.price;

        // Expected margin: Mikro'daki fiyattan hesapla (çarpan olarak)
        const expectedMargin = expectedPrice / currentCost;

        // Actual margin: B2B sistemindeki fiyattan hesapla (çarpan olarak)
        const actualMargin = actualPrice / currentCost;

        // Sapma: expected - actual (yüzde olarak)
        const deviation = ((actualMargin - expectedMargin) / expectedMargin) * 100;
        const deviationAmount = actualPrice - expectedPrice;

        // Status: ±2% tolerans
        let complianceStatus: 'OK' | 'HIGH' | 'LOW' = 'OK';
        if (deviation > 2) {
          complianceStatus = 'HIGH';
        } else if (deviation < -2) {
          complianceStatus = 'LOW';
        }

        alerts.push({
          productCode: product.mikroCode,
          productName: product.name,
          category: product.category.name,
          currentCost,
          customerType: custType,
          expectedMargin: expectedMargin * 100, // Convert to percentage for display
          expectedPrice,
          actualPrice,
          deviation,
          deviationAmount,
          status: complianceStatus,
          priceSource: 'CATEGORY_RULE',
        });
      }
    }

    await mikroService.disconnect();

    // Status filtresi
    let filteredAlerts = alerts;
    if (status && status !== 'OK') {
      if (status === 'NON_COMPLIANT') {
        filteredAlerts = alerts.filter((a) => a.status !== 'OK');
      } else {
        filteredAlerts = alerts.filter((a) => a.status === status);
      }
    }

    // Sıralama
    filteredAlerts.sort((a, b) => {
      const aValue = (a as any)[sortBy] || 0;
      const bValue = (b as any)[sortBy] || 0;
      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    // Pagination
    const totalRecords = filteredAlerts.length;
    const offset = (page - 1) * limit;
    const paginatedAlerts = filteredAlerts.slice(offset, offset + limit);
    const totalPages = Math.ceil(totalRecords / limit);

    // Summary
    const compliantCount = alerts.filter((a) => a.status === 'OK').length;
    const highDeviationCount = alerts.filter((a) => a.status === 'HIGH').length;
    const lowDeviationCount = alerts.filter((a) => a.status === 'LOW').length;
    const avgDeviation = alerts.length > 0
      ? alerts.reduce((sum, a) => sum + Math.abs(a.deviation), 0) / alerts.length
      : 0;

    // Son senkronizasyon bilgisini al
    const lastSync = await prisma.syncLog.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { completedAt: 'desc' },
      select: {
        completedAt: true,
        syncType: true,
      },
    });

    return {
      alerts: paginatedAlerts,
      summary: {
        totalProducts: alerts.length,
        compliantCount,
        highDeviationCount,
        lowDeviationCount,
        avgDeviation,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
      metadata: {
        lastSyncAt: lastSync?.completedAt || null,
        syncType: lastSync?.syncType || null,
      },
    };
  }
}

export default new ReportsService();
