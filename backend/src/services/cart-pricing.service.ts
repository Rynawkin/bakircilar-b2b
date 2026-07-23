import { prisma } from '../utils/prisma';
import pricingService from './pricing.service';
import priceListService from './price-list.service';
import mikroService from './mikroFactory.service';
import { MikroCustomerSaleMovement, ProductPrices } from '../types';
import { resolveCustomerPriceLists, resolveCustomerPriceListsForProduct } from '../utils/customerPricing';
import { isAgreementApplicable, resolveAgreementPrice } from '../utils/agreements';
import { applyLastPriceFloor, resolveLastPriceOverride } from '../utils/lastPrice';
import { isStandardPriceListNo } from '../config/price-list-registry';

export type CartPriceType = 'INVOICED' | 'WHITE';
export type CartPriceMode = 'LIST' | 'EXCESS';
type PriceVisibilityValue = 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH';

type PricePair = {
  invoiced: number;
  white: number;
};

type CartProductForPricing = {
  id: string;
  name?: string | null;
  mikroCode: string;
  brandCode?: string | null;
  categoryId?: string | null;
  currentCost?: number | null;
  lastEntryPrice?: number | null;
  excessStock?: number | null;
  excludeFromDiscount?: boolean | null;
  prices: unknown;
};

type ExistingCartItem = {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  priceType: string;
  priceMode: string;
  unitPrice: number;
  lineNote?: string | null;
  createdAt?: Date;
  product?: CartProductForPricing;
};

type LineNotePatch = {
  itemId: string;
  value: string | null;
};

type LastSaleInfo = {
  price: number;
  saleDate: Date | null;
};

const buildLastSalesMap = (sales: MikroCustomerSaleMovement[]) => {
  const map = new Map<string, LastSaleInfo>();
  sales.forEach((sale) => {
    const code = String(sale.productCode || '').trim();
    if (!code || map.has(code)) return;
    const price = Number(sale.unitPrice);
    if (Number.isFinite(price) && price > 0) {
      const saleDate = sale.saleDate instanceof Date ? sale.saleDate : (sale.saleDate ? new Date(sale.saleDate) : null);
      map.set(code, {
        price,
        saleDate: saleDate && Number.isFinite(saleDate.getTime()) ? saleDate : null,
      });
    }
  });
  return map;
};

// ==================== YAPISKAN ISKONTO: LISTE-ENDEKSLI SON FIYAT ====================
// Problem: useLastPrices carilerde son satis fiyati ABSOLUTE tutulur; zam geldikce
// eski fiyat listeye gore goreli konumunu (ornegin "faturali 2 seviyesi") kaybeder ve
// marj sessizce erir. Cozum: Settings.lastPriceIndexationEnabled=true iken son satis
// fiyati, satis anindaki liste fiyatina oranlanip (ratio) GUNCEL liste fiyatiyla
// carpilarak bugune tasinir. Ayar false iken davranis bugunkuyle bit-bit aynidir.

type PriceChangeSnapshot = {
  changedAt: Date;
  // Degisen listenin numarasi (price_changes.price_list_no). priceList1..10 kolonlari
  // SYNC ANINDAKI guncel listelerdir (satis anindaki degil!) — o yuzden KULLANILMAZ.
  // Satis anindaki liste fiyati, ayni priceListNo'lu kayitlarin oldPrice/newPrice
  // zinciriyle turetilir. Eski satirlarda null olabilir (0 dahil gecersiz sayilir).
  priceListNo: number | null;
  oldPrice: number;
  newPrice: number;
};

// Veri hatasi korumasi: son satis fiyati / satis anindaki liste fiyati orani bu
// aralik disindaysa endeksleme uygulanmaz, ham son fiyat kullanilir.
const INDEXATION_RATIO_MIN = 0.5;
const INDEXATION_RATIO_MAX = 1.5;

const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// PriceChange (price_changes) snapshot'larini TOPLU ceker (productCode IN ...).
// Satis-tarihi eslestirmesi JS'te yapilir; boylece sepet basina 1 PG sorgusu yeter.
const fetchPriceChangeSnapshots = async (
  productCodes: string[]
): Promise<Map<string, PriceChangeSnapshot[]>> => {
  const result = new Map<string, PriceChangeSnapshot[]>();
  const uniqueCodes = Array.from(
    new Set(productCodes.map((code) => String(code || '').trim()).filter(Boolean))
  );
  // Sorgulanan her kod cache'e yazilir (bos dizi = kayit yok, tekrar sorgulama).
  uniqueCodes.forEach((code) => result.set(code, []));
  if (uniqueCodes.length === 0) return result;

  const rows = await prisma.priceChange.findMany({
    where: { productCode: { in: uniqueCodes } },
    orderBy: { changedAt: 'asc' },
    select: {
      productCode: true,
      changedAt: true,
      priceListNo: true,
      oldPrice: true,
      newPrice: true,
    },
  });

  rows.forEach((row) => {
    const code = String(row.productCode || '').trim();
    if (!code) return;
    const bucket = result.get(code);
    if (!bucket) return;
    // priceListNo: yalniz standart musteri listeleri endekslenebilir.
    // Kampanya 11/12 bu akisa bilerek dahil edilmez.
    const listNoRaw = Number(row.priceListNo);
    bucket.push({
      changedAt: row.changedAt,
      priceListNo: isStandardPriceListNo(listNoRaw) ? listNoRaw : null,
      oldPrice: toFiniteNumber(row.oldPrice),
      newPrice: toFiniteNumber(row.newPrice),
    });
  });

  return result;
};

// Sepet genelinde tek toplu on-yukleme (N+1 onlemi). syncCartDiscountAllocations
// gibi cok-urunlu akislar bunu bir kez cagirir; tekil akislar cache-miss'te
// urun basina kucuk tek sorguyla calisir.
export const preloadPriceChangeSnapshots = async (
  context: Awaited<ReturnType<typeof loadCartCustomerContext>>,
  productCodes: string[]
): Promise<void> => {
  if (!context.lastPriceIndexation.enabled) return;
  if (!context.customer.useLastPrices || !context.customer.mikroCariCode) return;
  const cache = context.lastPriceIndexation.snapshots;
  const missing = Array.from(
    new Set(productCodes.map((code) => String(code || '').trim()).filter(Boolean))
  ).filter((code) => !cache.has(code));
  if (missing.length === 0) return;
  const fetched = await fetchPriceChangeSnapshots(missing);
  fetched.forEach((snapshots, code) => cache.set(code, snapshots));
};

const getPriceChangeSnapshotsForProduct = async (
  context: Awaited<ReturnType<typeof loadCartCustomerContext>>,
  productCode: string
): Promise<PriceChangeSnapshot[]> => {
  const code = String(productCode || '').trim();
  if (!code) return [];
  const cache = context.lastPriceIndexation.snapshots;
  if (!cache.has(code)) {
    const fetched = await fetchPriceChangeSnapshots([code]);
    fetched.forEach((snapshots, key) => cache.set(key, snapshots));
  }
  return cache.get(code) || [];
};

/**
 * Liste-endeksli son fiyat hesabi (saf fonksiyon).
 *
 * Satis anindaki liste fiyati SADECE ayni listenin (priceListNo === listNo)
 * degisiklik kayitlarindan turetilir; PriceChange.priceList1..10 kolonlari
 * sync anindaki guncel listeler oldugu icin KULLANILMAZ.
 *
 * Akis:
 * 1. Ayni listNo'lu kayitlar icinde satis tarihinden ONCEKI EN SON kaydin
 *    newPrice'i = satis anindaki liste fiyati. Oncesinde kayit yoksa satistan
 *    SONRAKI ILK ayni-listNo kaydin oldPrice'i alinir. O da yoksa endeksleme
 *    yapilmaz, ham fiyat doner.
 * 2. ratio = sonSatisFiyati / satisAnindakiListeFiyati (ayni KDV duzlemi:
 *    degisiklik kayitlari da guncel listeler de Mikro fiyat listesi
 *    kaynaklidir, oran duzlem farkini goturur).
 * 3. ratio [0.5, 1.5] disindaysa veri hatasi sayilir, ham fiyat doner.
 * 4. endeksliFiyat = min(ratio * guncelListeFiyati, guncelListeFiyati) —
 *    endekslemenin amaci liste KONUMUNU korumaktir; listenin ustune cikmak
 *    hicbir senaryoda istenmez (tavan = guncel liste fiyati).
 * 5. effective = max(hamSonFiyat, endeksliFiyat) — musteri aleyhine olmayan
 *    surpriz dususler engellenir; endeksleme yalnizca fiyati YUKARI tasir.
 *
 * Mevcut frenler (maliyet tabani / guard liste) donen degerin UZERINE
 * resolveLastPriceOverride icinde aynen uygulanmaya devam eder.
 */
export const computeIndexedLastSalePrice = (params: {
  rawLastSalePrice: number;
  saleDate: Date | null;
  listNo: number;
  currentListPrice: number;
  snapshots: PriceChangeSnapshot[];
}): { price: number; indexed: boolean } => {
  const raw = Number(params.rawLastSalePrice);
  const fallback = { price: raw, indexed: false };
  if (!Number.isFinite(raw) || raw <= 0) return fallback;

  const saleTime = params.saleDate instanceof Date ? params.saleDate.getTime() : NaN;
  if (!Number.isFinite(saleTime)) return fallback;

  const listNo = Number(params.listNo);
  if (!isStandardPriceListNo(listNo)) return fallback;

  // Sadece verilen listenin degisiklik kayitlari (changedAt ASC sirali gelir).
  const listSnapshots = (params.snapshots || []).filter(
    (snapshot) => snapshot.priceListNo === listNo
  );
  if (listSnapshots.length === 0) return fallback;

  // Satistan ONCEKI EN SON kayit (before) ve satistan SONRAKI ILK kayit (after).
  let before: PriceChangeSnapshot | null = null;
  let after: PriceChangeSnapshot | null = null;
  for (const snapshot of listSnapshots) {
    if (snapshot.changedAt.getTime() <= saleTime) {
      before = snapshot;
    } else {
      after = snapshot;
      break;
    }
  }

  // Satis anindaki liste fiyati: onceki kaydin YENI fiyati; yoksa sonraki ilk
  // kaydin ESKI fiyati (degisiklikten once gecerli olan fiyat).
  const listPriceAtSale = before
    ? toFiniteNumber(before.newPrice)
    : toFiniteNumber(after?.oldPrice);
  if (listPriceAtSale <= 0) return fallback;

  const currentListPrice = Number(params.currentListPrice);
  if (!Number.isFinite(currentListPrice) || currentListPrice <= 0) return fallback;

  const ratio = raw / listPriceAtSale;
  if (!Number.isFinite(ratio) || ratio < INDEXATION_RATIO_MIN || ratio > INDEXATION_RATIO_MAX) {
    return fallback;
  }

  // Tavan: endeksli fiyat guncel liste fiyatini ASAMAZ (liste konumu korunur,
  // listenin ustune cikilmaz).
  const indexedPrice = Math.min(ratio * currentListPrice, currentListPrice);
  if (!Number.isFinite(indexedPrice) || indexedPrice <= raw) {
    // Endeksli fiyat ham son fiyattan kucuk olamaz: effective = max(raw, indexed).
    return fallback;
  }

  return { price: indexedPrice, indexed: true };
};

const getLastPriceGuardPrices = (
  priceStats: any,
  guardInvoicedListNo?: number | null,
  guardWhiteListNo?: number | null
): PricePair | undefined => {
  if (!guardInvoicedListNo && !guardWhiteListNo) return undefined;
  return {
    invoiced: guardInvoicedListNo
      ? priceListService.getListPrice(priceStats, guardInvoicedListNo)
      : 0,
    white: guardWhiteListNo
      ? priceListService.getListPrice(priceStats, guardWhiteListNo)
      : 0,
  };
};

export const isCartPriceTypeAllowed = (
  visibility: PriceVisibilityValue | null | undefined,
  priceType: CartPriceType
): boolean => {
  if (visibility === 'WHITE_ONLY') return priceType === 'WHITE';
  if (visibility === 'BOTH') return true;
  return priceType === 'INVOICED';
};

const selectPrice = (prices: PricePair, priceType: CartPriceType) =>
  priceType === 'INVOICED' ? prices.invoiced : prices.white;

// Miktar KESIRLI olabilir: musteri ana birimden kucuk bir alt birim secince
// (or. ana birim KOLI, 2. birim PAKET, 10 PAKET = 0.5 KOLI) ana-birim miktari
// kesirli gelir. Bu yuzden Math.trunc YAPMA — 6 ondaliga yuvarla, negatifi kirp.
const normalizeQuantity = (value: number) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.round(quantity * 1e6) / 1e6);
};

// Stok adedi (fazla stok kotasi) daima tam sayidir — kesirli alt birim mantigi
// buraya sizmasin diye ayri (integer) normalizasyon.
const normalizeStockCount = (value: number) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.floor(quantity));
};

export const loadCartCustomerContext = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      mikroCariCode: true,
      customerType: true,
      invoicedPriceListNo: true,
      whitePriceListNo: true,
      priceVisibility: true,
      useLastPrices: true,
      lastPriceGuardType: true,
      lastPriceGuardInvoicedListNo: true,
      lastPriceGuardWhiteListNo: true,
      lastPriceCostBasis: true,
      lastPriceMinCostPercent: true,
      parentCustomerId: true,
      parentCustomer: {
        select: {
          id: true,
          mikroCariCode: true,
          customerType: true,
          invoicedPriceListNo: true,
          whitePriceListNo: true,
          priceVisibility: true,
          useLastPrices: true,
          lastPriceGuardType: true,
          lastPriceGuardInvoicedListNo: true,
          lastPriceGuardWhiteListNo: true,
          lastPriceCostBasis: true,
          lastPriceMinCostPercent: true,
        },
      },
    },
  });

  const customer = user?.parentCustomer || user;
  if (!user || !customer || !customer.customerType) {
    throw new Error('User has no customer type');
  }

  const [settings, priceListRules] = await Promise.all([
    prisma.settings.findFirst({
      select: {
        customerPriceLists: true,
        lastPriceIndexationEnabled: true,
      },
    }),
    prisma.customerPriceListRule.findMany({
      where: { customerId: customer.id },
    }),
  ]);

  const basePriceListPair = resolveCustomerPriceLists(customer, settings);
  const effectiveVisibility: PriceVisibilityValue | null | undefined = user.parentCustomerId
    ? (customer.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : customer.priceVisibility;

  return {
    user,
    customer,
    settings,
    priceListRules,
    basePriceListPair,
    effectiveVisibility,
    // Yapiskan iskonto: liste-endeksli son fiyat. Ayar kapaliyken (default) hicbir
    // ek sorgu/hesap yapilmaz, davranis eski haliyle bire bir aynidir.
    lastPriceIndexation: {
      enabled: Boolean(settings?.lastPriceIndexationEnabled),
      // productCode -> changedAt ASC sirali PriceChange snapshot'lari (context omurlu cache)
      snapshots: new Map<string, PriceChangeSnapshot[]>(),
    },
  };
};

export const resolveCartUnitPrices = async (params: {
  context: Awaited<ReturnType<typeof loadCartCustomerContext>>;
  product: CartProductForPricing;
  priceType: CartPriceType;
  totalQuantity: number;
}) => {
  const { context, product, priceType, totalQuantity } = params;
  const { customer, priceListRules, basePriceListPair, effectiveVisibility } = context;

  const productPrices = product.prices as ProductPrices;
  const customerPrices = pricingService.getPriceForCustomer(
    productPrices,
    customer.customerType as any
  );

  const priceStats = await priceListService.getPriceStats(product.mikroCode);
  const productPriceListPair = resolveCustomerPriceListsForProduct(
    basePriceListPair,
    priceListRules,
    {
      brandCode: product.brandCode,
      categoryId: product.categoryId,
    }
  );

  const listInvoiced = priceListService.getListPriceWithFallback(
    priceStats,
    productPriceListPair.invoiced
  );
  const listWhite = priceListService.getListPriceWithFallback(
    priceStats,
    productPriceListPair.white
  );

  const listPricesBase = {
    invoiced: listInvoiced > 0 ? listInvoiced : customerPrices.invoiced,
    white: listWhite > 0 ? listWhite : customerPrices.white,
  };

  const guardPrices = getLastPriceGuardPrices(
    priceStats,
    customer.lastPriceGuardInvoicedListNo,
    customer.lastPriceGuardWhiteListNo
  );

  let listPrices = listPricesBase;
  let lastSaleCandidate: number | undefined;
  if (customer.useLastPrices && customer.mikroCariCode) {
    try {
      const sales = await mikroService.getCustomerSalesMovements(
        customer.mikroCariCode as string,
        [product.mikroCode],
        1
      );
      const lastSalesMap = buildLastSalesMap(sales);
      const lastSale = lastSalesMap.get(product.mikroCode);
      lastSaleCandidate = lastSale?.price;

      // Yapiskan iskonto cozumu: ayar acikken ham son fiyat, satis anindaki liste
      // konumuna endekslenir. Endeksleme mumkun degilse ham fiyata sessizce dusulur.
      if (lastSale && context.lastPriceIndexation.enabled) {
        try {
          const indexationListNo =
            priceType === 'INVOICED'
              ? productPriceListPair.invoiced
              : productPriceListPair.white;
          const snapshots = await getPriceChangeSnapshotsForProduct(
            context,
            product.mikroCode
          );
          // Oran tutarliligi icin fallback'siz, birebir ayni listenin guncel fiyati.
          const currentListPrice = priceListService.getListPrice(
            priceStats,
            indexationListNo
          );
          lastSaleCandidate = computeIndexedLastSalePrice({
            rawLastSalePrice: lastSale.price,
            saleDate: lastSale.saleDate,
            listNo: indexationListNo,
            currentListPrice,
            snapshots,
          }).price;
        } catch (error) {
          console.error('Last price indexation failed; falling back to raw last price', {
            customerId: customer.id,
            productCode: product.mikroCode,
            error,
          });
          lastSaleCandidate = lastSale.price;
        }
      }

      const lastPriceResult = resolveLastPriceOverride({
        config: customer,
        lastSalePrice: lastSaleCandidate,
        listPrices: listPricesBase,
        guardPrices,
        product: {
          currentCost: product.currentCost,
          lastEntryPrice: product.lastEntryPrice,
        },
        priceVisibility: effectiveVisibility,
      });
      listPrices = lastPriceResult.prices;
    } catch (error) {
      console.error('Customer last price failed while pricing cart', {
        customerId: customer.id,
        productCode: product.mikroCode,
        error,
      });
    }
  }

  let listUnitPrice = selectPrice(listPrices, priceType);
  let excessPrices = customerPrices;
  if (customer.useLastPrices && customer.mikroCariCode) {
    try {
      excessPrices = applyLastPriceFloor({
        config: customer,
        lastSalePrice: lastSaleCandidate,
        basePrices: customerPrices,
        guardPrices,
        product: {
          currentCost: product.currentCost,
          lastEntryPrice: product.lastEntryPrice,
        },
        priceVisibility: effectiveVisibility,
      });
    } catch (error) {
      console.error('Customer last price floor failed while pricing excess cart item', {
        customerId: customer.id,
        productCode: product.mikroCode,
        error,
      });
    }
  }
  let excessUnitPrice = selectPrice(excessPrices, priceType);

  const agreement = await prisma.customerPriceAgreement.findFirst({
    where: {
      customerId: customer.id,
      productId: product.id,
    },
    select: {
      priceInvoiced: true,
      priceWhite: true,
      minQuantity: true,
      validFrom: true,
      validTo: true,
    },
  });

  if (agreement && isAgreementApplicable(agreement, new Date(), totalQuantity)) {
    listUnitPrice = resolveAgreementPrice(agreement, priceType, listUnitPrice);
    excessUnitPrice = resolveAgreementPrice(agreement, priceType, excessUnitPrice);
  }

  if (customer.useLastPrices && customer.mikroCariCode) {
    const floored = applyLastPriceFloor({
      config: customer,
      lastSalePrice: lastSaleCandidate,
      basePrices:
        priceType === 'INVOICED'
          ? { invoiced: excessUnitPrice, white: excessPrices.white }
          : { invoiced: excessPrices.invoiced, white: excessUnitPrice },
      guardPrices,
      product: {
        currentCost: product.currentCost,
        lastEntryPrice: product.lastEntryPrice,
      },
      priceVisibility: effectiveVisibility,
    });
    excessUnitPrice = selectPrice(floored, priceType);
  }

  // excludeFromDiscount: yonetici bu urunu indirime sokmamayi sectiyse fazla stok
  // olsa bile sepette/siparise DAIMA liste fiyati uygulanir (indirim kotasi 0).
  const excessQuantityLimit = product.excludeFromDiscount
    ? 0
    : normalizeStockCount(Number(product.excessStock || 0));
  const hasExcessDiscount =
    excessQuantityLimit > 0 &&
    Number.isFinite(listUnitPrice) &&
    Number.isFinite(excessUnitPrice) &&
    listUnitPrice > 0 &&
    excessUnitPrice > 0 &&
    excessUnitPrice < listUnitPrice;

  return {
    listUnitPrice,
    excessUnitPrice,
    excessQuantityLimit: hasExcessDiscount ? excessQuantityLimit : 0,
    hasExcessDiscount,
    // Mikro fiziksel liste numarasi. Fiyat anlasma/son fiyat/fazla stok ile
    // degisse bile siparis satirinda hangi standart listenin baz alindigi izlenir.
    priceListNo:
      priceType === 'INVOICED'
        ? productPriceListPair.invoiced
        : productPriceListPair.white,
  };
};

export const rebalanceCartProductPriceType = async (params: {
  context: Awaited<ReturnType<typeof loadCartCustomerContext>>;
  cartId: string;
  productId: string;
  product?: CartProductForPricing | null;
  priceType: CartPriceType;
  totalQuantity: number;
  existingItems?: ExistingCartItem[];
  lineNotePatch?: LineNotePatch;
}) => {
  const {
    context,
    cartId,
    productId,
    priceType,
    lineNotePatch,
  } = params;
  const totalQuantity = normalizeQuantity(params.totalQuantity);
  const product =
    params.product ||
    await prisma.product.findUnique({
      where: { id: productId },
    });

  if (!product) {
    throw new Error('Product not found');
  }

  const existingItems =
    params.existingItems ||
    await prisma.cartItem.findMany({
      where: {
        cartId,
        productId,
        priceType,
      },
      orderBy: { createdAt: 'asc' },
    });

  const prices = await resolveCartUnitPrices({
    context,
    product,
    priceType,
    totalQuantity,
  });

  // Indirim kotasi urun bazindadir: BOTH gorunurluklu musteri faturali+beyaz satirlarla
  // limitin 2 katini indirimli alamasin diye diger fiyat tipine tahsis edilen EXCESS
  // miktari toplam kotadan dusulur (tahsis sirasi mevcut akisla ayni kalir).
  let excessQuantity = 0;
  if (prices.hasExcessDiscount) {
    const otherPriceType: CartPriceType = priceType === 'INVOICED' ? 'WHITE' : 'INVOICED';
    const otherTypeExcess = await prisma.cartItem.aggregate({
      where: {
        cartId,
        productId,
        priceType: otherPriceType,
        priceMode: 'EXCESS',
      },
      _sum: { quantity: true },
    });
    const otherAllocated = normalizeQuantity(Number(otherTypeExcess._sum.quantity || 0));
    const remainingLimit = Math.max(0, prices.excessQuantityLimit - otherAllocated);
    excessQuantity = Math.min(totalQuantity, remainingLimit);
  }
  const listQuantity = Math.max(0, totalQuantity - excessQuantity);
  const fallbackNote =
    lineNotePatch?.value ??
    existingItems.find((item) => item.lineNote && item.lineNote.trim())?.lineNote ??
    null;

  const syncMode = async (mode: CartPriceMode, quantity: number, unitPrice: number) => {
    const modeItems = existingItems.filter((item) => item.priceMode === mode);
    const keep = modeItems[0];
    const duplicateIds = modeItems.slice(1).map((item) => item.id);

    if (duplicateIds.length > 0) {
      await prisma.cartItem.deleteMany({ where: { id: { in: duplicateIds } } });
    }

    if (quantity <= 0) {
      if (keep) {
        await prisma.cartItem.delete({ where: { id: keep.id } });
      }
      return undefined;
    }

    const patchedNote =
      keep && lineNotePatch?.itemId === keep.id
        ? lineNotePatch.value
        : keep?.lineNote ?? fallbackNote;

    if (keep) {
      const updated = await prisma.cartItem.update({
        where: { id: keep.id },
        data: {
          quantity,
          unitPrice,
          lineNote: patchedNote || null,
        },
      });
      return updated.id;
    }

    // Grup kararliligi: bu urunun bu fiyat-tipinde zaten satiri varsa (mode split
    // -> ornegin LIST varken EXCESS satiri aciliyor), yeni satir urunun ILK ekleme
    // zamanini miras alsin ki tum satirlari ayni createdAt ile gruplu kalsin ve
    // sepetteki konumu (getCart createdAt desc) miktar/birim duzenlemesinde kaymasin.
    // existingItems createdAt asc siralidir; [0] en erken eklemedir.
    // existingItems bos ise (tamamen yeni urun) createdAt varsayilana (now) birakilir
    // -> yeni urun en ustte gorunur.
    const inheritedCreatedAt =
      existingItems.length > 0 ? existingItems[0].createdAt : undefined;
    const created = await prisma.cartItem.create({
      data: {
        cartId,
        productId,
        quantity,
        priceType,
        priceMode: mode,
        unitPrice,
        lineNote: fallbackNote || null,
        ...(inheritedCreatedAt ? { createdAt: inheritedCreatedAt } : {}),
      },
    });
    return created.id;
  };

  if (totalQuantity <= 0) {
    await prisma.cartItem.deleteMany({
      where: {
        cartId,
        productId,
        priceType,
      },
    });
    await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } }).catch(() => null);
    return {
      cartItemIds: [],
      excessQuantity: 0,
      listQuantity: 0,
      excessUnitPrice: prices.excessUnitPrice,
      listUnitPrice: prices.listUnitPrice,
    };
  }

  const excessItemId = await syncMode('EXCESS', excessQuantity, prices.excessUnitPrice);
  const listItemId = await syncMode('LIST', listQuantity, prices.listUnitPrice);
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } }).catch(() => null);

  return {
    cartItemIds: [excessItemId, listItemId].filter(Boolean) as string[],
    excessQuantity,
    listQuantity,
    excessUnitPrice: prices.excessUnitPrice,
    listUnitPrice: prices.listUnitPrice,
  };
};

export const syncCartDiscountAllocations = async (userId: string) => {
  const context = await loadCartCustomerContext(userId);
  const cart = await prisma.cart.findUnique({
    where: { userId: context.user.id },
    include: {
      items: {
        include: {
          product: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    return;
  }

  // N+1 onlemi: endeksleme acik ise sepetteki TUM urunlerin PriceChange
  // snapshot'lari tek toplu PG sorgusuyla on-yuklenir (sepet basina 1 sorgu).
  try {
    await preloadPriceChangeSnapshots(
      context,
      cart.items
        .map((item) => item.product?.mikroCode)
        .filter((code): code is string => Boolean(code))
    );
  } catch (error) {
    console.error('Price change snapshot preload failed', { userId, error });
  }

  const groups = new Map<string, typeof cart.items>();
  cart.items.forEach((item) => {
    const priceType = item.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
    const key = `${item.productId}::${priceType}`;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  });

  for (const items of groups.values()) {
    const first = items[0];
    if (!first) continue;
    if (!first.product?.active || first.product?.hiddenFromCustomers) {
      continue;
    }
    const priceType: CartPriceType = first.priceType === 'WHITE' ? 'WHITE' : 'INVOICED';
    const hasDiscountSignal =
      Number(first.product?.excessStock || 0) > 0 ||
      items.some((item) => item.priceMode === 'EXCESS');
    if (!hasDiscountSignal) {
      continue;
    }

    if (!isCartPriceTypeAllowed(context.effectiveVisibility, priceType)) {
      continue;
    }

    try {
      await rebalanceCartProductPriceType({
        context,
        cartId: cart.id,
        productId: first.productId,
        product: first.product,
        priceType,
        totalQuantity: items.reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0),
        existingItems: items,
      });
    } catch (error) {
      console.error('Cart discount allocation sync failed', {
        userId,
        productId: first.productId,
        priceType,
        error,
      });
    }
  }
};

export default {
  isCartPriceTypeAllowed,
  loadCartCustomerContext,
  resolveCartUnitPrices,
  rebalanceCartProductPriceType,
  syncCartDiscountAllocations,
  preloadPriceChangeSnapshots,
  computeIndexedLastSalePrice,
};
