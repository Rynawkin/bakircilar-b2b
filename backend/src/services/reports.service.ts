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
   * Mikro STOKLAR_USER tablosundaki marj tanımlarını (Marj_1-5) kullanarak
   * beklenen fiyatları hesaplar ve Mikro'daki gerçek toptan satış fiyatlarıyla karşılaştırır.
   *
   * Karşılaştırma:
   * - Beklenen Fiyat = Maliyet × Marj_X
   * - Gerçek Fiyat = Mikro'daki Toptan Satış X fiyatı (STOK_SATIS_FIYAT_LISTELERI)
   * - Sapma = Gerçek fiyata uygulanan marj ile tanımlı marj arasındaki fark
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

    // Mikro'dan marj tanımlarını ve fiyatları çek
    const mikroService = require('./mikroFactory.service').default;
    await mikroService.connect();

    const alerts: MarginComplianceAlert[] = [];
    const customerTypes = customerType
      ? [customerType]
      : ['BAYI', 'PERAKENDE', 'VIP', 'OZEL', 'TOPTAN5'];

    // Marj kolonları ve fiyat listesi mapping
    // Her müşteri tipi için hangi marj ve hangi fiyat listesi kullanılacak
    const mappings: Record<string, { marginCol: string; priceList: number }> = {
      'BAYI': { marginCol: 'Marj_1', priceList: 1 },
      'PERAKENDE': { marginCol: 'Marj_2', priceList: 2 },
      'VIP': { marginCol: 'Marj_3', priceList: 3 },
      'OZEL': { marginCol: 'Marj_4', priceList: 4 },
      'TOPTAN5': { marginCol: 'Marj_5', priceList: 5 },
    };

    for (const product of products) {
      const currentCost = product.currentCost || 0;

      if (currentCost === 0) continue;

      // Mikro'dan bu ürünün marj tanımlarını ve fiyatlarını çek
      let productData: any = null;
      try {
        const result = await mikroService.executeQuery(`
          SELECT
            u.Marj_1,
            u.Marj_2,
            u.Marj_3,
            u.Marj_4,
            u.Marj_5
          FROM STOKLAR s
          LEFT JOIN STOKLAR_USER u ON s.sto_Guid = u.Record_uid
          WHERE s.sto_kod = '${product.mikroCode}'
        `);

        if (result.length > 0) {
          productData = result[0];
        }
      } catch (error) {
        console.error(`Error fetching data for ${product.mikroCode}:`, error);
        continue;
      }

      if (!productData) continue;

      // Fiyat listelerini çek
      let priceListData: any[] = [];
      try {
        priceListData = await mikroService.executeQuery(`
          SELECT
            sfiyat_listesirano as priceListNo,
            sfiyat_fiyati as price
          FROM STOK_SATIS_FIYAT_LISTELERI
          WHERE sfiyat_stokkod = '${product.mikroCode}'
            AND sfiyat_fiyati > 0
            AND sfiyat_listesirano BETWEEN 1 AND 5
        `);
      } catch (error) {
        console.error(`Error fetching price lists for ${product.mikroCode}:`, error);
        continue;
      }

      for (const custType of customerTypes) {
        const mapping = mappings[custType];
        if (!mapping) continue;

        // Mikro'daki tanımlı marj
        const marginStr = productData[mapping.marginCol];
        if (!marginStr || marginStr === '') continue;

        // Marj değerini parse et (Türkçe virgülü nokta ile değiştir)
        const expectedMarginMultiplier = parseFloat(marginStr.toString().replace(',', '.'));
        if (isNaN(expectedMarginMultiplier) || expectedMarginMultiplier === 0) continue;

        // Mikro'daki gerçek toptan satış fiyatı
        const priceListEntry = priceListData.find((p: any) => p.priceListNo === mapping.priceList);
        if (!priceListEntry || priceListEntry.price === 0) continue;

        const actualPrice = priceListEntry.price;

        // Beklenen fiyat: Maliyet × Tanımlı Marj
        const expectedPrice = currentCost * expectedMarginMultiplier;

        // Gerçek fiyata uygulanan marj
        const actualMarginMultiplier = actualPrice / currentCost;

        // Sapma: (gerçek marj - beklenen marj) / beklenen marj × 100
        const deviation = ((actualMarginMultiplier - expectedMarginMultiplier) / expectedMarginMultiplier) * 100;
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
          expectedMargin: expectedMarginMultiplier * 100, // Yüzde olarak (2.0 → 200%)
          expectedPrice,
          actualPrice,
          deviation,
          deviationAmount,
          status: complianceStatus,
          priceSource: 'MIKRO_MARGIN',
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
