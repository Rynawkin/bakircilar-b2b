/**
 * Reports Service
 *
 * Raporları PostgreSQL'den (senkronize edilmiş verilerden) üretir.
 * Mikro'ya her seferinde bağlanmaya gerek yok, sabah sync'te çekilen veriler kullanılır.
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikro.service';
import exclusionService from './exclusion.service';

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
  expectedMargin: number; // % kar marjı (e.g., 60 for 1.6x multiplier)
  expectedPrice: number;
  actualPrice: number;
  deviation: number; // % deviation
  deviationAmount: number; // TL deviation
  status: 'OK' | 'HIGH' | 'LOW'; // OK: ±2%, HIGH: >2%, LOW: <-2%
  priceSource: 'CATEGORY_RULE' | 'PRODUCT_OVERRIDE' | 'MIKRO_MARGIN';
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

// Price History types
interface PriceListChange {
  listNo: number;
  listName: string;
  oldPrice: number;
  newPrice: number;
  changeAmount: number;
  changePercent: number;
}

interface PriceChange {
  productCode: string;
  productName: string;
  category: string;
  changeDate: Date;
  priceChanges: PriceListChange[];
  isConsistent: boolean; // true if all 10 lists changed on same date
  updatedListsCount: number;
  missingLists: number[];
  avgChangePercent: number;
  changeDirection: 'increase' | 'decrease' | 'mixed';
}

interface PriceHistoryResponse {
  changes: PriceChange[];
  summary: {
    totalChanges: number;
    consistentChanges: number;
    inconsistentChanges: number;
    inconsistencyRate: number;
    avgIncreasePercent: number;
    avgDecreasePercent: number;
    topIncreases: { product: string; percent: number }[];
    topDecreases: { product: string; percent: number }[];
    last30DaysChanges: number;
    last7DaysChanges: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalRecords: number;
  };
  metadata: {
    dataSource: string;
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
   * Kar Marjı Analizi Raporu (019703 - Komisyon Faturası Hareket Yönetimi)
   *
   * Mikro'daki fn_KomisyonFaturasiHareketYonetimi fonksiyonunu kullanarak
   * bekleyen siparişler ve faturalar üzerinden detaylı kar marjı analizi yapar.
   *
   * Özellikler:
   * - Son giriş maliyeti ve ortalama maliyete göre kar hesaplar
   * - Gerçek satış işlemlerini analiz eder
   * - Evrak bazında detaylı bilgi verir
   */
  async getMarginComplianceReport(options: {
    startDate?: string;
    endDate?: string;
    includeCompleted?: number; // 1 = tamamlananları da dahil et, 0 = sadece bekleyenler
    customerType?: string;
    category?: string;
    status?: string; // HIGH (>30%), LOW (<10%), NEGATIVE (<0%), OK (10-30%)
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<any> {
    const {
      startDate,
      endDate,
      includeCompleted = 1,
      customerType,
      category,
      status,
      page = 1,
      limit = 100,
      sortBy = 'OrtalamaKarYuzde',
      sortOrder = 'desc',
    } = options;

    // Tarih parametreleri - eğer verilmemişse bugünü kullan
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const start = startDate || today;
    const end = endDate || today;

    // Mikro'dan rapor fonksiyonunu çağır
    const mikroService = require('./mikroFactory.service').default;
    await mikroService.connect();

    try {
      const query = `
        SELECT *
        FROM dbo.fn_KomisyonFaturasiHareketYonetimi('${start}', '${end}', ${includeCompleted})
        ORDER BY [msg_S_0089], [msg_S_0001]
      `;

      const result = await mikroService.executeQuery(query);

      // Filtreleme
      let filteredData = result;

      // Müşteri tipi filtresi (SektorKodu alanından)
      if (customerType) {
        filteredData = filteredData.filter((row: any) =>
          row.SektorKodu && row.SektorKodu.includes(customerType)
        );
      }

      // Kategori filtresi (GrupKodu alanından)
      if (category) {
        filteredData = filteredData.filter((row: any) =>
          row.GrupKodu && row.GrupKodu.includes(category)
        );
      }

      // Kar yüzdesi durumu filtresi
      if (status) {
        if (status === 'HIGH') {
          // Yüksek kar marjı (>30%)
          filteredData = filteredData.filter((row: any) =>
            row.OrtalamaKarYuzde > 30
          );
        } else if (status === 'LOW') {
          // Düşük kar marjı (<10%)
          filteredData = filteredData.filter((row: any) =>
            row.OrtalamaKarYuzde < 10
          );
        } else if (status === 'NEGATIVE') {
          // Negatif kar (zarar)
          filteredData = filteredData.filter((row: any) =>
            row.OrtalamaKarYuzde < 0
          );
        } else if (status === 'OK') {
          // Normal kar marjı (10-30%)
          filteredData = filteredData.filter((row: any) =>
            row.OrtalamaKarYuzde >= 10 && row.OrtalamaKarYuzde <= 30
          );
        }
      }

      // Sıralama
      filteredData.sort((a: any, b: any) => {
        const aValue = a[sortBy] || 0;
        const bValue = b[sortBy] || 0;

        if (sortOrder === 'desc') {
          return bValue - aValue;
        } else {
          return aValue - bValue;
        }
      });

      // Pagination
      const totalRecords = filteredData.length;
      const offset = (page - 1) * limit;
      const paginatedData = filteredData.slice(offset, offset + limit);
      const totalPages = Math.ceil(totalRecords / limit);

      // Summary hesapla
      const totalRevenue = filteredData.reduce((sum: number, row: any) => sum + (row.TutarKDV || 0), 0);
      const totalProfit = filteredData.reduce((sum: number, row: any) => sum + (row.ToplamKarOrtMalGöre || 0), 0);
      const avgMargin = filteredData.length > 0
        ? filteredData.reduce((sum: number, row: any) => sum + (row.OrtalamaKarYuzde || 0), 0) / filteredData.length
        : 0;

      const highMarginCount = filteredData.filter((row: any) => row.OrtalamaKarYuzde > 30).length;
      const lowMarginCount = filteredData.filter((row: any) => row.OrtalamaKarYuzde < 10).length;
      const negativeMarginCount = filteredData.filter((row: any) => row.OrtalamaKarYuzde < 0).length;

      await mikroService.disconnect();

      return {
        data: paginatedData,
        summary: {
          totalRecords,
          totalRevenue,
          totalProfit,
          avgMargin,
          highMarginCount,
          lowMarginCount,
          negativeMarginCount,
        },
        pagination: {
          page,
          limit,
          totalPages,
          totalRecords,
        },
        metadata: {
          reportDate: new Date(),
          startDate: start,
          endDate: end,
          includeCompleted,
        },
      };
    } catch (error) {
      await mikroService.disconnect();
      throw error;
    }
  }

  /**
   * En Çok Satan Ürünler Raporu
   *
   * Belirtilen tarih aralığında en çok satılan ürünleri listeler.
   * Hem satış tutarı hem de karlılık bazında sıralanabilir.
   */
  async getTopProducts(options: {
    startDate?: string;
    endDate?: string;
    brand?: string;
    category?: string;
    minQuantity?: number;
    sortBy?: 'revenue' | 'profit' | 'profit_asc' | 'margin' | 'margin_asc' | 'quantity';
    page?: number;
    limit?: number;
  } = {}): Promise<{
    products: Array<{
      productCode: string;
      productName: string;
      brand: string;
      category: string;
      quantity: number;
      revenue: number;
      cost: number;
      profit: number;
      profitMargin: number;
      avgPrice: number;
      customerCount: number;
    }>;
    summary: {
      totalRevenue: number;
      totalProfit: number;
      avgProfitMargin: number;
      totalProducts: number;
    };
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
      totalRecords: number;
    };
  }> {
    const {
      startDate,
      endDate,
      brand,
      category,
      minQuantity = 0,
      sortBy = 'revenue',
      page = 1,
      limit = 50,
    } = options;

    await mikroService.connect();

    // WHERE koşulları - STOK_HAREKETLERI kullan (gerçek satışlar)
    const whereConditions = [
      'sth_cins = 0',  // Satış hareketleri
      'sth_tip = 1'    // Normal hareket (fatura/irsaliye)
    ];

    if (startDate) {
      whereConditions.push(`sth_tarih >= '${startDate}'`);
    }
    if (endDate) {
      whereConditions.push(`sth_tarih <= '${endDate}'`);
    }

    // Add exclusion conditions
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    whereConditions.push(...exclusionConditions);

    const whereClause = whereConditions.join(' AND ');

    // DEBUG LOGGING
    console.log('=== TOP PRODUCTS EXCLUSION DEBUG ===');
    console.log('Exclusion conditions:', exclusionConditions);
    console.log('Full WHERE clause:', whereClause);

    // Stok hareketlerini çek ve grupla (gerçek satışlar)
    const query = `
      SELECT
        sth.sth_stok_kod as productCode,
        MAX(st.sto_isim) as productName,
        MAX(st.sto_marka_kodu) as brand,
        SUM(sth.sth_miktar) as quantity,
        SUM(sth.sth_tutar) as revenue,
        SUM(sth.sth_miktar * st.sto_standartmaliyet) as totalCost,
        COUNT(DISTINCT sth.sth_cari_kodu) as customerCount
      FROM STOK_HAREKETLERI sth
      LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
      WHERE ${whereClause}
        AND sth.sth_stok_kod IS NOT NULL
        AND sth.sth_stok_kod != ''
      GROUP BY sth.sth_stok_kod
      HAVING SUM(sth.sth_miktar) >= ${minQuantity}
    `;

    console.log('Full SQL query:', query);

    const rawData = await mikroService.executeQuery(query);

    console.log('Raw data count:', rawData.length);
    console.log('First 3 product codes:', rawData.slice(0, 3).map((p: any) => p.productCode));
    await mikroService.disconnect();

    // Filtreleme
    let filteredData = rawData;
    if (brand) {
      filteredData = filteredData.filter((p: any) =>
        p.brand?.toLowerCase().includes(brand.toLowerCase())
      );
    }
    if (category) {
      filteredData = filteredData.filter((p: any) =>
        p.category?.toLowerCase().includes(category.toLowerCase())
      );
    }

    // Hesaplamalar
    const products = filteredData.map((p: any) => {
      const revenue = p.revenue || 0;
      const cost = p.totalCost || 0;
      const profit = revenue - cost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const avgPrice = p.quantity > 0 ? revenue / p.quantity : 0;

      return {
        productCode: p.productCode,
        productName: p.productName || 'Bilinmiyor',
        brand: p.brand || 'Belirtilmemiş',
        category: 'Kategori', // TODO: Get from category table
        quantity: p.quantity,
        revenue,
        cost,
        profit,
        profitMargin,
        avgPrice,
        customerCount: p.customerCount,
      };
    });

    // Sıralama
    products.sort((a, b) => {
      switch (sortBy) {
        case 'profit':
          return b.profit - a.profit;
        case 'profit_asc':
          return a.profit - b.profit;  // Düşükten yükseğe
        case 'margin':
          return b.profitMargin - a.profitMargin;
        case 'margin_asc':
          return a.profitMargin - b.profitMargin;  // Düşükten yükseğe
        case 'quantity':
          return b.quantity - a.quantity;
        case 'revenue':
        default:
          return b.revenue - a.revenue;
      }
    });

    // Summary
    const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
    const totalProfit = products.reduce((sum, p) => sum + p.profit, 0);
    const avgProfitMargin = products.length > 0
      ? products.reduce((sum, p) => sum + p.profitMargin, 0) / products.length
      : 0;

    // Pagination
    const totalRecords = products.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    const paginatedProducts = products.slice(offset, offset + limit);

    return {
      products: paginatedProducts,
      summary: {
        totalRevenue,
        totalProfit,
        avgProfitMargin,
        totalProducts: totalRecords,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
    };
  }

  /**
   * En Çok Satın Alan Müşteriler Raporu
   *
   * Belirtilen tarih aralığında en çok satın alan müşterileri listeler.
   * Hem alış tutarı hem de karlılık bazında sıralanabilir.
   */
  async getTopCustomers(options: {
    startDate?: string;
    endDate?: string;
    sector?: string;
    minOrderAmount?: number;
    sortBy?: 'revenue' | 'profit' | 'margin' | 'orderCount';
    page?: number;
    limit?: number;
  } = {}): Promise<{
    customers: Array<{
      customerCode: string;
      customerName: string;
      sector: string;
      orderCount: number;
      revenue: number;
      cost: number;
      profit: number;
      profitMargin: number;
      avgOrderAmount: number;
      topCategory: string;
      lastOrderDate: Date;
    }>;
    summary: {
      totalRevenue: number;
      totalProfit: number;
      avgProfitMargin: number;
      totalCustomers: number;
    };
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
      totalRecords: number;
    };
  }> {
    const {
      startDate,
      endDate,
      sector,
      minOrderAmount = 0,
      sortBy = 'revenue',
      page = 1,
      limit = 50,
    } = options;

    await mikroService.connect();

    // WHERE koşulları - STOK_HAREKETLERI kullan (gerçek satışlar)
    const whereConditions = [
      'sth_cins = 0',  // Satış hareketleri
      'sth_tip = 1'    // Normal hareket (fatura/irsaliye)
    ];

    if (startDate) {
      whereConditions.push(`sth_tarih >= '${startDate}'`);
    }
    if (endDate) {
      whereConditions.push(`sth_tarih <= '${endDate}'`);
    }

    // Add exclusion conditions
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    whereConditions.push(...exclusionConditions);

    const whereClause = whereConditions.join(' AND ');

    // Müşteri bazında stok hareketlerini çek (gerçek satışlar)
    const query = `
      SELECT
        sth.sth_cari_kodu as customerCode,
        MAX(c.cari_unvan1) as customerName,
        MAX(c.cari_sektor) as sector,
        COUNT(DISTINCT sth.sth_evrakno_seri + CAST(sth.sth_evrakno_sira AS VARCHAR)) as orderCount,
        SUM(sth.sth_tutar) as revenue,
        SUM(sth.sth_miktar * st.sto_standartmaliyet) as totalCost,
        MAX(sth.sth_tarih) as lastOrderDate
      FROM STOK_HAREKETLERI sth
      LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
      LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
      WHERE ${whereClause}
        AND sth.sth_cari_kodu IS NOT NULL
        AND sth.sth_cari_kodu != ''
      GROUP BY sth.sth_cari_kodu
      HAVING SUM(sth.sth_tutar) >= ${minOrderAmount}
    `;

    const rawData = await mikroService.executeQuery(query);

    // Artık maliyet de sorguya dahil, ayrı sorgu gerek yok
    const customersWithCost = rawData.map((customer: any) => ({
      ...customer,
      totalCost: customer.totalCost || 0,
    }));

    await mikroService.disconnect();

    // Filtreleme
    let filteredData = customersWithCost;
    if (sector) {
      filteredData = filteredData.filter((c: any) =>
        c.sector?.toLowerCase().includes(sector.toLowerCase())
      );
    }

    // Hesaplamalar
    const customers = filteredData.map((c: any) => {
      const revenue = c.revenue || 0;
      const cost = c.totalCost || 0;
      const profit = revenue - cost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const avgOrderAmount = c.orderCount > 0 ? revenue / c.orderCount : 0;

      return {
        customerCode: c.customerCode,
        customerName: c.customerName || 'Bilinmiyor',
        sector: c.sector || 'Belirtilmemiş',
        orderCount: c.orderCount,
        revenue,
        cost,
        profit,
        profitMargin,
        avgOrderAmount,
        topCategory: 'TODO', // TODO: En çok alınan kategori
        lastOrderDate: c.lastOrderDate,
      };
    });

    // Sıralama
    customers.sort((a, b) => {
      switch (sortBy) {
        case 'profit':
          return b.profit - a.profit;
        case 'margin':
          return b.profitMargin - a.profitMargin;
        case 'orderCount':
          return b.orderCount - a.orderCount;
        case 'revenue':
        default:
          return b.revenue - a.revenue;
      }
    });

    // Summary
    const totalRevenue = customers.reduce((sum, c) => sum + c.revenue, 0);
    const totalProfit = customers.reduce((sum, c) => sum + c.profit, 0);
    const avgProfitMargin = customers.length > 0
      ? customers.reduce((sum, c) => sum + c.profitMargin, 0) / customers.length
      : 0;

    // Pagination
    const totalRecords = customers.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    const paginatedCustomers = customers.slice(offset, offset + limit);

    return {
      customers: paginatedCustomers,
      summary: {
        totalRevenue,
        totalProfit,
        avgProfitMargin,
        totalCustomers: totalRecords,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
    };
  }

  /**
   * Fiyat Geçmişi Raporu
   *
   * Mikro'daki STOK_FIYAT_DEGISIKLIKLERI tablosundan tüm fiyat değişikliklerini listeler.
   * Önemli: Her ürünün 10 fiyat listesi olmalı ve hepsi aynı gün güncellenmelidir.
   * - Liste 1-5: Perakende (KDV Dahil Maliyet × Marj_{1-5})
   * - Liste 6-10: Faturalı (KDV Hariç Maliyet × Marj_{1-5})
   */
  async getPriceHistory(options: {
    startDate?: string;
    endDate?: string;
    productCode?: string;
    productName?: string;
    category?: string;
    priceListNo?: number;
    consistencyStatus?: 'all' | 'consistent' | 'inconsistent';
    changeDirection?: 'increase' | 'decrease' | 'mixed' | 'all';
    minChangePercent?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PriceHistoryResponse> {
    const {
      startDate,
      endDate,
      productCode,
      productName,
      category,
      priceListNo,
      consistencyStatus = 'all',
      changeDirection = 'all',
      minChangePercent,
      page = 1,
      limit = 50,
      sortBy = 'changeDate',
      sortOrder = 'desc',
    } = options;

    await mikroService.connect();

    // Liste isimleri
    const priceListNames: { [key: number]: string } = {
      1: 'Perakende 1',
      2: 'Perakende 2',
      3: 'Perakende 3',
      4: 'Perakende 4',
      5: 'Perakende 5',
      6: 'Faturalı 1',
      7: 'Faturalı 2',
      8: 'Faturalı 3',
      9: 'Faturalı 4',
      10: 'Faturalı 5',
    };

    // 1. Fiyat değişikliklerini çek
    let whereConditions = ['1=1'];

    if (startDate) {
      whereConditions.push(`fid_tarih >= '${startDate}'`);
    }
    if (endDate) {
      whereConditions.push(`fid_tarih <= '${endDate}'`);
    }
    if (productCode) {
      whereConditions.push(`fid_stok_kod LIKE '%${productCode}%'`);
    }
    if (priceListNo) {
      whereConditions.push(`fid_fiyat_no = ${priceListNo}`);
    }

    const whereClause = whereConditions.join(' AND ');

    const priceChangesQuery = `
      SELECT TOP 10000
        f.fid_stok_kod,
        f.fid_tarih,
        f.fid_fiyat_no,
        f.fid_eskifiy_tutar,
        f.fid_yenifiy_tutar,
        s.sto_isim,
        'Kategori Yok' as kategori
      FROM STOK_FIYAT_DEGISIKLIKLERI f
      LEFT JOIN STOKLAR s ON f.fid_stok_kod = s.sto_kod
      
      WHERE ${whereClause}
        AND f.fid_eskifiy_tutar != f.fid_yenifiy_tutar
        AND s.sto_pasif_fl = 0
      ORDER BY f.fid_tarih DESC, f.fid_stok_kod, f.fid_fiyat_no
    `;

    const rawChanges = await mikroService.executeQuery(priceChangesQuery);

    // 2. Ürün adı filtresi (SQL'de LIKE performans sorunu olabilir, sonradan filtrele)
    let filteredChanges = rawChanges;
    if (productName) {
      const searchTerm = productName.toLowerCase();
      filteredChanges = rawChanges.filter((c: any) =>
        c.sto_isim?.toLowerCase().includes(searchTerm)
      );
    }
    if (category) {
      const searchTerm = category.toLowerCase();
      filteredChanges = filteredChanges.filter((c: any) =>
        c.kategori?.toLowerCase().includes(searchTerm)
      );
    }

    // 3. Ürün + Tarih bazında grupla
    const groupedByProductAndDate: {
      [key: string]: {
        productCode: string;
        productName: string;
        category: string;
        changeDate: Date;
        changes: Array<{
          listNo: number;
          oldPrice: number;
          newPrice: number;
        }>;
      };
    } = {};

    for (const change of filteredChanges) {
      const key = `${change.fid_stok_kod}_${change.fid_tarih.toISOString().split('T')[0]}`;

      if (!groupedByProductAndDate[key]) {
        groupedByProductAndDate[key] = {
          productCode: change.fid_stok_kod,
          productName: change.sto_isim || 'Bilinmiyor',
          category: change.kategori || 'Kategori Yok',
          changeDate: change.fid_tarih,
          changes: [],
        };
      }

      groupedByProductAndDate[key].changes.push({
        listNo: change.fid_fiyat_no,
        oldPrice: change.fid_eskifiy_tutar,
        newPrice: change.fid_yenifiy_tutar,
      });
    }

    // 4. Her grup için PriceChange objesi oluştur
    const priceChanges: PriceChange[] = [];

    for (const key in groupedByProductAndDate) {
      const group = groupedByProductAndDate[key];

      // Consistency check: 10 liste de güncellenmiş mi?
      const updatedLists = group.changes.map(c => c.listNo);
      const isConsistent = updatedLists.length === 10;
      const missingLists = Array.from({ length: 10 }, (_, i) => i + 1)
        .filter(n => !updatedLists.includes(n));

      // PriceListChange'leri oluştur
      const priceListChanges: PriceListChange[] = group.changes.map(c => {
        const changeAmount = c.newPrice - c.oldPrice;
        const changePercent = c.oldPrice > 0
          ? (changeAmount / c.oldPrice) * 100
          : 0;

        return {
          listNo: c.listNo,
          listName: priceListNames[c.listNo] || `Liste ${c.listNo}`,
          oldPrice: c.oldPrice,
          newPrice: c.newPrice,
          changeAmount,
          changePercent,
        };
      });

      // Ortalama değişim yüzdesi
      const avgChangePercent = priceListChanges.length > 0
        ? priceListChanges.reduce((sum, c) => sum + c.changePercent, 0) / priceListChanges.length
        : 0;

      // Değişim yönü
      let direction: 'increase' | 'decrease' | 'mixed' = 'mixed';
      const increases = priceListChanges.filter(c => c.changeAmount > 0).length;
      const decreases = priceListChanges.filter(c => c.changeAmount < 0).length;

      if (increases > 0 && decreases === 0) {
        direction = 'increase';
      } else if (decreases > 0 && increases === 0) {
        direction = 'decrease';
      }

      priceChanges.push({
        productCode: group.productCode,
        productName: group.productName,
        category: group.category,
        changeDate: group.changeDate,
        priceChanges: priceListChanges,
        isConsistent,
        updatedListsCount: updatedLists.length,
        missingLists,
        avgChangePercent,
        changeDirection: direction,
      });
    }

    await mikroService.disconnect();

    // 5. Filtreleme
    let filtered = priceChanges;

    // Consistency filtresi
    if (consistencyStatus === 'consistent') {
      filtered = filtered.filter(c => c.isConsistent);
    } else if (consistencyStatus === 'inconsistent') {
      filtered = filtered.filter(c => !c.isConsistent);
    }

    // Değişim yönü filtresi
    if (changeDirection !== 'all') {
      filtered = filtered.filter(c => c.changeDirection === changeDirection);
    }

    // Min değişim yüzdesi filtresi
    if (minChangePercent !== undefined) {
      filtered = filtered.filter(c => Math.abs(c.avgChangePercent) >= minChangePercent);
    }

    // 6. Sıralama
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      if (sortBy === 'changeDate') {
        aValue = a.changeDate.getTime();
        bValue = b.changeDate.getTime();
      } else if (sortBy === 'avgChangePercent') {
        aValue = Math.abs(a.avgChangePercent);
        bValue = Math.abs(b.avgChangePercent);
      } else if (sortBy === 'productName') {
        aValue = a.productName;
        bValue = b.productName;
      } else if (sortBy === 'category') {
        aValue = a.category;
        bValue = b.category;
      } else {
        aValue = a.changeDate.getTime();
        bValue = b.changeDate.getTime();
      }

      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });

    // 7. Summary istatistikleri
    const totalChanges = filtered.length;
    const consistentChanges = filtered.filter(c => c.isConsistent).length;
    const inconsistentChanges = totalChanges - consistentChanges;
    const inconsistencyRate = totalChanges > 0
      ? (inconsistentChanges / totalChanges) * 100
      : 0;

    const increases = filtered.filter(c => c.avgChangePercent > 0);
    const decreases = filtered.filter(c => c.avgChangePercent < 0);

    const avgIncreasePercent = increases.length > 0
      ? increases.reduce((sum, c) => sum + c.avgChangePercent, 0) / increases.length
      : 0;

    const avgDecreasePercent = decreases.length > 0
      ? decreases.reduce((sum, c) => sum + c.avgChangePercent, 0) / decreases.length
      : 0;

    // En yüksek artışlar
    const topIncreases = [...filtered]
      .filter(c => c.avgChangePercent > 0)
      .sort((a, b) => b.avgChangePercent - a.avgChangePercent)
      .slice(0, 5)
      .map(c => ({
        product: `${c.productCode} - ${c.productName}`,
        percent: c.avgChangePercent,
      }));

    // En yüksek azalışlar
    const topDecreases = [...filtered]
      .filter(c => c.avgChangePercent < 0)
      .sort((a, b) => a.avgChangePercent - b.avgChangePercent)
      .slice(0, 5)
      .map(c => ({
        product: `${c.productCode} - ${c.productName}`,
        percent: c.avgChangePercent,
      }));

    // Son 30 ve 7 gün
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const last30DaysChanges = filtered.filter(c => c.changeDate >= thirtyDaysAgo).length;
    const last7DaysChanges = filtered.filter(c => c.changeDate >= sevenDaysAgo).length;

    // 8. Pagination
    const totalRecords = filtered.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    const paginatedChanges = filtered.slice(offset, offset + limit);

    return {
      changes: paginatedChanges,
      summary: {
        totalChanges,
        consistentChanges,
        inconsistentChanges,
        inconsistencyRate,
        avgIncreasePercent,
        avgDecreasePercent,
        topIncreases,
        topDecreases,
        last30DaysChanges,
        last7DaysChanges,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
      metadata: {
        dataSource: 'MIKRO_STOK_FIYAT_DEGISIKLIKLERI',
      },
    };
  }

  /**
   * Ürün Detay Raporu - Belirli bir ürünün hangi müşterilere satıldığını gösterir
   */
  async getProductCustomers(params: {
    productCode: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      productCode,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = params;

    await mikroService.connect();

    // WHERE koşulları
    const whereConditions = [
      'sth_cins = 0',  // Satış hareketleri
      'sth_tip = 1',    // Normal hareket (fatura/irsaliye)
      `sth_stok_kod = '${productCode}'`,
    ];

    if (startDate) {
      whereConditions.push(`sth_tarih >= '${startDate}'`);
    }
    if (endDate) {
      whereConditions.push(`sth_tarih <= '${endDate}'`);
    }

    // Add exclusion conditions (customer-based exclusions only for this report)
    const exclusionConditions = await exclusionService.buildStokHareketleriExclusionConditions();
    whereConditions.push(...exclusionConditions);

    const whereClause = whereConditions.join(' AND ');

    // Müşteri detaylarını çek
    const query = `
      SELECT
        sth.sth_cari_kodu as customerCode,
        MAX(c.cari_unvan1) as customerName,
        MAX(c.cari_sektor_kodu) as sectorCode,
        COUNT(DISTINCT sth.sth_evrakno_seri + CAST(sth.sth_evrakno_sira AS VARCHAR)) as orderCount,
        SUM(sth.sth_miktar) as totalQuantity,
        SUM(sth.sth_tutar) as totalRevenue,
        SUM(sth.sth_miktar * st.sto_standartmaliyet) as totalCost,
        MAX(sth.sth_tarih) as lastOrderDate
      FROM STOK_HAREKETLERI sth
      LEFT JOIN CARI_HESAPLAR c ON sth.sth_cari_kodu = c.cari_kod
      LEFT JOIN STOKLAR st ON sth.sth_stok_kod = st.sto_kod
      WHERE ${whereClause}
      GROUP BY sth.sth_cari_kodu
      ORDER BY SUM(sth.sth_tutar) DESC
    `;

    const rawData = await mikroService.executeQuery(query);
    await mikroService.disconnect();

    // Kar ve kar marjını hesapla
    const customers = rawData.map((row: any) => ({
      customerCode: row.customerCode,
      customerName: row.customerName || 'Bilinmeyen Müşteri',
      sectorCode: row.sectorCode || '-',
      orderCount: row.orderCount,
      totalQuantity: parseFloat(row.totalQuantity || 0),
      totalRevenue: parseFloat(row.totalRevenue || 0),
      totalCost: parseFloat(row.totalCost || 0),
      totalProfit: parseFloat(row.totalRevenue || 0) - parseFloat(row.totalCost || 0),
      profitMargin: parseFloat(row.totalRevenue || 0) > 0
        ? ((parseFloat(row.totalRevenue || 0) - parseFloat(row.totalCost || 0)) / parseFloat(row.totalRevenue || 0)) * 100
        : 0,
      lastOrderDate: row.lastOrderDate,
    }));

    // Summary
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalRevenue, 0);
    const totalProfit = customers.reduce((sum, c) => sum + c.totalProfit, 0);
    const totalQuantity = customers.reduce((sum, c) => sum + c.totalQuantity, 0);
    const avgProfitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Pagination
    const totalRecords = customers.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const offset = (page - 1) * limit;
    const paginatedCustomers = customers.slice(offset, offset + limit);

    return {
      customers: paginatedCustomers,
      summary: {
        totalCustomers: totalRecords,
        totalQuantity,
        totalRevenue,
        totalProfit,
        avgProfitMargin,
      },
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords,
      },
    };
  }
}

export default new ReportsService();
