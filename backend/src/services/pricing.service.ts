/**
 * Pricing Service
 *
 * Dinamik fiyatlandırma motoru:
 * - Maliyet hesaplama (dinamik formüllerle)
 * - Faturalı fiyat: Maliyet + kar marjı = KDV HARİÇ satış fiyatı
 *   Formül: cost × (1 + profitMargin)
 *   Müşteriye bu fiyat gösterilir ve üzerine KDV eklenir
 * - Beyaz fiyat: Faturasız özel fiyat (KDV'nin yarısı kadar ek marj)
 *   Formül: invoicedPrice × (1 + vatRate/2)
 *   Alternatif açıklama: cost × (1 + vatRate/2) × (1 + profitMargin)
 */

import { prisma } from '../utils/prisma';
import { ProductPrices } from '../types';

interface CostCalculationParams {
  lastEntryPrice?: number;
  lastEntryDate?: Date;
  currentCost?: number;
  currentCostDate?: Date;
  method: 'LAST_ENTRY' | 'CURRENT_COST' | 'DYNAMIC';
  dynamicParams?: {
    dayThreshold?: number;
    priceWeightNew?: number;
    priceWeightOld?: number;
  };
}

class PricingService {
  /**
   * Ürünün maliyetini hesapla
   */
  calculateCost(params: CostCalculationParams): number {
    const { method, lastEntryPrice, currentCost, lastEntryDate, currentCostDate, dynamicParams } =
      params;

    switch (method) {
      case 'LAST_ENTRY':
        return lastEntryPrice || 0;

      case 'CURRENT_COST':
        return currentCost || 0;

      case 'DYNAMIC':
        return this.calculateDynamicCost({
          lastEntryPrice,
          lastEntryDate,
          currentCost,
          currentCostDate,
          dynamicParams,
        });

      default:
        return lastEntryPrice || 0;
    }
  }

  /**
   * Dinamik maliyet hesaplama
   *
   * BASIT AÇIKLAMA:
   *
   * Bu sistem, ürünün maliyetini hesaplarken iki fiyatı karıştırır:
   * 1. "Son Giriş Fiyatı" - En son ne kadara aldık
   * 2. "Güncel Maliyet" - Mikro'daki tanımlı maliyet
   *
   * Nasıl çalışır?
   * - Eğer son alışımız YAKINDA olduysa (örn. 30 gün içinde):
   *   → Son giriş fiyatına %70 ağırlık ver, güncel maliyete %30 ver
   *   → Örnek: Son giriş 100 TL, Güncel 120 TL → Hesaplanan: 100×0.7 + 120×0.3 = 106 TL
   *
   * - Eğer son alışımız ÇOK ÖNCE olduysa (30 günden eski):
   *   → Güncel maliyete %70 ağırlık ver, son girişe %30 ver
   *   → Örnek: Son giriş 100 TL, Güncel 120 TL → Hesaplanan: 120×0.7 + 100×0.3 = 114 TL
   *
   * Mantık: Yakın zamanda aldıysak o fiyat daha gerçekçidir. Eski alışsa,
   * güncel maliyeti baz almalıyız çünkü fiyatlar değişmiş olabilir.
   */
  private calculateDynamicCost(params: {
    lastEntryPrice?: number;
    lastEntryDate?: Date;
    currentCost?: number;
    currentCostDate?: Date;
    dynamicParams?: {
      dayThreshold?: number; // Varsayılan: 30 gün
      priceWeightNew?: number; // Varsayılan: 0.7 (yeni giriş ağırlığı)
      priceWeightOld?: number; // Varsayılan: 0.3 (eski giriş ağırlığı)
    };
  }): number {
    const {
      lastEntryPrice = 0,
      lastEntryDate,
      currentCost = 0,
      dynamicParams = {},
    } = params;

    // Eğer biri yoksa diğerini döndür
    if (!lastEntryPrice) return currentCost;
    if (!currentCost) return lastEntryPrice;
    if (!lastEntryDate) return currentCost;

    const dayThreshold = dynamicParams.dayThreshold || 30;
    const weightNew = dynamicParams.priceWeightNew || 0.7;
    const weightOld = dynamicParams.priceWeightOld || 0.3;

    // Son giriş tarihinden bugüne kaç gün geçmiş
    const now = new Date();
    const daysSinceLastEntry = Math.floor(
      (now.getTime() - lastEntryDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastEntry <= dayThreshold) {
      // Son giriş yeni → Son giriş fiyatına daha fazla ağırlık ver
      return lastEntryPrice * weightNew + currentCost * weightOld;
    } else {
      // Son giriş eski → Güncel maliyete daha fazla ağırlık ver
      return currentCost * weightNew + lastEntryPrice * weightOld;
    }
  }

  /**
   * Faturalı fiyat hesapla (KDV HARİÇ satış fiyatı)
   *
   * Formül: cost × (1 + profitMargin)
   * Örnek: maliyet=100, marj=0.20 → 100 × 1.20 = 120 TL (KDV hariç)
   *
   * Bu fiyat müşteriye gösterilir ve üzerine KDV eklenir.
   * Mikro'ya yazarken: sip_tutar = bu fiyat, sip_vergi = tutar × vatRate
   */
  calculateInvoicedPrice(cost: number, profitMargin: number): number {
    return cost * (1 + profitMargin);
  }

  /**
   * Beyaz fiyat hesapla (Faturasız özel fiyat)
   *
   * Formül: invoicedPrice × (1 + vatRate/2)
   *
   * Mantık: Faturalı fiyata KDV'nin yarısı kadar ek marj eklenir.
   * Bu, "maliyete KDV'nin yarısını ekleyip marjlandırma" ile eşdeğerdir.
   *
   * Örnek: maliyet=100, marj=0.20, KDV=0.18
   * - Faturalı = 100 × 1.20 = 120 TL (KDV hariç)
   * - Beyaz = 120 × (1 + 0.18/2) = 120 × 1.09 = 130.8 TL (faturasız)
   *
   * Alternatif açıklama: cost × (1 + vatRate/2) × (1 + profitMargin)
   * - 100 × 1.09 × 1.20 = 130.8 TL (aynı sonuç)
   */
  calculateWhitePrice(invoicedPrice: number, vatRate: number): number {
    return invoicedPrice * (1 + vatRate / 2);
  }

  /**
   * Ürün için tüm fiyatları hesapla (8 fiyat)
   */
  async calculateAllPricesForProduct(params: {
    productId: string;
    cost: number;
    vatRate: number;
  }): Promise<ProductPrices> {
    const { productId, cost, vatRate } = params;

    // Ürünün kategorisini bul
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    // Kategori bazlı kar marjları
    const categoryRules = await prisma.categoryPriceRule.findMany({
      where: { categoryId: product.categoryId },
    });

    // Ürün bazlı override'lar
    const productOverrides = await prisma.productPriceOverride.findMany({
      where: { productId },
    });

    // 4 müşteri tipi için kar marjlarını belirle
    const customerTypes = ['BAYI', 'PERAKENDE', 'VIP', 'OZEL'] as const;

    const prices: any = {};

    for (const customerType of customerTypes) {
      // Önce override'a bak, yoksa kategori kuralını kullan
      const override = productOverrides.find((o) => o.customerType === customerType);
      const categoryRule = categoryRules.find((r) => r.customerType === customerType);

      const profitMargin = override?.profitMargin ?? categoryRule?.profitMargin ?? 0.15; // Varsayılan %15

      // Faturalı fiyat (KDV hariç satış fiyatı)
      const invoiced = this.calculateInvoicedPrice(cost, profitMargin);

      // Beyaz fiyat (faturalı fiyat + KDV'nin yarısı)
      const white = this.calculateWhitePrice(invoiced, vatRate);

      prices[customerType] = {
        INVOICED: Math.round(invoiced * 100) / 100, // 2 ondalık basamak
        WHITE: Math.round(white * 100) / 100,
      };
    }

    return prices as ProductPrices;
  }

  /**
   * Müşterinin göreceği fiyatı döndür
   */
  getPriceForCustomer(
    prices: ProductPrices,
    customerType: 'BAYI' | 'PERAKENDE' | 'VIP' | 'OZEL'
  ): { invoiced: number; white: number } {
    return {
      invoiced: prices[customerType].INVOICED,
      white: prices[customerType].WHITE,
    };
  }

  /**
   * Bir kategorinin tüm ürünleri için fiyatları yeniden hesapla
   */
  async recalculatePricesForCategory(categoryId: string): Promise<number> {
    const products = await prisma.product.findMany({
      where: { categoryId, active: true },
    });

    const settings = await prisma.settings.findFirst();
    if (!settings) {
      throw new Error('Settings not found');
    }

    let updatedCount = 0;

    for (const product of products) {
      const cost = this.calculateCost({
        method: settings.costCalculationMethod as any,
        lastEntryPrice: product.lastEntryPrice || undefined,
        lastEntryDate: product.lastEntryDate || undefined,
        currentCost: product.currentCost || undefined,
        currentCostDate: product.currentCostDate || undefined,
        dynamicParams: settings.dynamicCostParams as any,
      });

      const prices = await this.calculateAllPricesForProduct({
        productId: product.id,
        cost,
        vatRate: product.vatRate,
      });

      await prisma.product.update({
        where: { id: product.id },
        data: {
          calculatedCost: cost,
          prices: prices as any,
        },
      });

      updatedCount++;
    }

    return updatedCount;
  }

  /**
   * Tüm ürünler için fiyatları yeniden hesapla
   */
  async recalculateAllPrices(syncLogId?: string): Promise<number> {
    const products = await prisma.product.findMany({
      where: { active: true },
    });

    const settings = await prisma.settings.findFirst();
    if (!settings) {
      throw new Error('Settings not found');
    }

    const totalProducts = products.length;
    let updatedCount = 0;

    // SyncLog'a toplam fiyat hesaplama sayısını kaydet
    if (syncLogId) {
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          details: {
            totalPricesToCalculate: totalProducts,
          },
        },
      });
    }

    for (const product of products) {
      const cost = this.calculateCost({
        method: settings.costCalculationMethod as any,
        lastEntryPrice: product.lastEntryPrice || undefined,
        lastEntryDate: product.lastEntryDate || undefined,
        currentCost: product.currentCost || undefined,
        currentCostDate: product.currentCostDate || undefined,
        dynamicParams: settings.dynamicCostParams as any,
      });

      const prices = await this.calculateAllPricesForProduct({
        productId: product.id,
        cost,
        vatRate: product.vatRate,
      });

      await prisma.product.update({
        where: { id: product.id },
        data: {
          calculatedCost: cost,
          prices: prices as any,
        },
      });

      updatedCount++;

      // Her 100 üründe bir SyncLog'u güncelle
      if (syncLogId && updatedCount % 100 === 0) {
        try {
          await prisma.syncLog.update({
            where: { id: syncLogId },
            data: {
              details: {
                totalPricesToCalculate: totalProducts,
                pricesCalculated: updatedCount,
              },
            },
          });
        } catch (error) {
          console.error('SyncLog güncelleme hatası (pricing):', error);
        }
      }
    }

    return updatedCount;
  }
}

export default new PricingService();
