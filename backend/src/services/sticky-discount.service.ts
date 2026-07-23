/**
 * Yapiskan Iskonto Dedektoru (SALT OKUMA raporu) — v2
 *
 * GERCEK PROBLEM (kullanici tarifi): satisci carinin ATANAN faturali listesinin
 * USTUNDE satmistir (ornek: liste "faturali 4" = 100, satis = 160). useLastPrices
 * acik oldugu icin cari sepette hep 160'i GORUR. Liste zamlarla yukselirken bu
 * mutlak 160 yerinde kalir; liste 160'i gecince eklenen prim (premium) tamamen
 * erir ve cari artik listeden UCUZ almaya baslar.
 *
 * Eski rapor "listenin ALTINDAKI" farklari (musterinin hic gormedigi) listeledigi
 * icin yanlisti. Bu v2 SADECE musterinin GERCEKTEN GORDUGU son-satis fiyatli
 * satirlari (cart-pricing useLastPrices + guard kurali BIREBIR replike) ve
 * sonFiyat > guncelListeFiyati (gorunur prim) olanlari alir.
 *
 * Metdrikler:
 * - listeFiyatiSatisAninda: satis anindaki liste fiyati (PriceChange kayitlari,
 *   priceListNo === listNo; en son changedAt <= saleDate -> newPrice; yoksa ilk
 *   sonraki -> oldPrice; yoksa fallback = guncel liste).
 * - primSatisAnindaPct = (sonFiyat - listeFiyatiSatisAninda)/listeFiyatiSatisAninda*100
 * - primBugunPct       = (sonFiyat - guncelListe)/guncelListe*100
 * - erimePct           = primSatisAnindaPct - primBugunPct
 * - aylikPrimTL        = (sonFiyat - guncelListe) * son90GunAdet / 3
 * - kritik             = primBugunPct <= 10 (prim yakinda liste zamlarina yenik dusecek)
 *
 * Mikro'ya SADECE SELECT; hicbir yere yazmaz.
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { resolveCustomerPriceLists } from '../utils/customerPricing';
import { resolveLastPriceOverride } from '../utils/lastPrice';
import {
  getPriceListFallbackChain,
  isStandardPriceListNo,
  STANDARD_PRICE_LIST_NOS,
} from '../config/price-list-registry';
import { computeIndexedLastSalePrice } from './cart-pricing.service';

export type StickyDiscountRow = {
  cariKodu: string;
  cariAdi: string;
  stokKodu: string;
  stokAdi: string;
  listNo: number;
  sonFiyat: number;               // musterinin GERCEKTEN gordugu birim fiyat
  sonSatisTarihi: string;         // ISO tarih
  fiyatYasiGun: number;
  listeFiyatiSatisAninda: number; // satis anindaki liste fiyati
  guncelListeFiyati: number;      // bugunku liste fiyati
  primSatisAnindaPct: number;
  primBugunPct: number;
  erimePct: number;
  son90GunAdet: number;
  aylikPrimTL: number;
  kritik: boolean;
};

export type StickyDiscountSummary = {
  rowCount: number;
  customerCount: number;
  totalMonthlyPremiumTL: number;
  criticalCount: number;
  worstErosion: Array<{
    cariKodu: string;
    cariAdi: string;
    toplamAylikPrimTL: number;
    satirSayisi: number;
  }>;
  params: {
    lookbackDays: number;
    minPremiumNowPercent: number;
  };
  generatedAt: string;
};

export type StickyDiscountWarning = {
  code: 'DUPLICATE_CANONICAL_PRICE';
  message: string;
  affectedPairCount: number;
  affectedProductCount: number;
  affectedProducts: string[];
  affectedPairs: string[];
};

export type StickyDiscountReport = {
  rows: StickyDiscountRow[];
  summary: StickyDiscountSummary;
  warnings: StickyDiscountWarning[];
};

// Guvenlik tavani: Mikro'dan cekilecek toplam cari x urun son-satis satiri.
const MAX_SALE_ROWS = 20000;
// Mikro IN (...) chunk boyutlari
const CARI_CHUNK_SIZE = 100;
const PRODUCT_CHUNK_SIZE = 500;

const escapeSqlLiteral = (value: string): string => String(value || '').replace(/'/g, "''");

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

// MSSQL icin dil/locale bagimsiz tarih literali: 'YYYYMMDD'
const toMssqlDateLiteral = (date: Date): string =>
  date.toISOString().slice(0, 10).replace(/-/g, '');

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type CanonicalPriceRow = {
  productCode?: unknown;
  listNo?: unknown;
  price?: unknown;
  candidateCount?: unknown;
};

type CanonicalPriceSnapshot = {
  prices: Map<string, Map<number, number>>;
  duplicatePairs: string[];
  duplicateProducts: string[];
};

export const normalizeCanonicalPriceRows = (
  rows: CanonicalPriceRow[]
): CanonicalPriceSnapshot => {
  const prices = new Map<string, Map<number, number>>();
  const duplicatePairs = new Set<string>();
  const duplicateProducts = new Set<string>();

  for (const record of rows || []) {
    const code = String(record?.productCode || '').trim().toUpperCase();
    const listNo = Number(record?.listNo);
    const price = toFiniteNumber(record?.price);
    const candidateCount = Math.max(
      0,
      Math.trunc(Number(record?.candidateCount) || 0)
    );
    if (!code || !isStandardPriceListNo(listNo)) continue;

    if (candidateCount > 1) {
      duplicatePairs.add(`${code}/L${listNo}`);
      duplicateProducts.add(code);
    }
    if (price <= 0) continue;

    if (!prices.has(code)) prices.set(code, new Map<number, number>());
    prices.get(code)!.set(listNo, price);
  }

  return {
    prices,
    duplicatePairs: Array.from(duplicatePairs).sort(),
    duplicateProducts: Array.from(duplicateProducts).sort(),
  };
};

// cart-pricing.loadCartCustomerContext ile ayni useLastPrices/guard alanlari
type CustomerInfo = {
  cariKodu: string;
  cariAdi: string;
  invoicedListNo: number;
  whiteListNo: number;
  priceVisibility: 'INVOICED_ONLY' | 'WHITE_ONLY' | 'BOTH' | null;
  useLastPrices: boolean;
  lastPriceGuardType: 'COST' | 'PRICE_LIST' | null;
  lastPriceGuardInvoicedListNo: number | null;
  lastPriceGuardWhiteListNo: number | null;
  lastPriceCostBasis: 'CURRENT_COST' | 'LAST_ENTRY' | null;
  lastPriceMinCostPercent: number | null;
};

type LastSaleRow = {
  cariCode: string;
  productCode: string;
  productName: string;
  saleDate: Date;
  unitPrice: number;
  qtyLast90: number;
};

type ProductCost = {
  currentCost: number | null;
  lastEntryPrice: number | null;
};

// PriceChange snapshot'i (cart-pricing ile ayni sekil; buraya kopyalandi)
type PriceChangeSnapshot = {
  changedAt: Date;
  priceListNo: number | null;
  oldPrice: number;
  newPrice: number;
};

/**
 * Kapsamdaki carileri yukler: aktif, useLastPrices=true, mikroCariCode dolu CUSTOMER.
 * Guard alanlari da alinir (musterinin son-satis fiyatini gercekten gorup gormedigini
 * cart-pricing kurallariyla belirlemek icin).
 */
const loadScopedCustomers = async (): Promise<Map<string, CustomerInfo>> => {
  const users = await prisma.user.findMany({
    where: {
      role: 'CUSTOMER',
      active: true,
      useLastPrices: true,
      mikroCariCode: { not: null },
    },
    select: {
      mikroCariCode: true,
      name: true,
      mikroName: true,
      displayName: true,
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
  });

  const map = new Map<string, CustomerInfo>();
  users.forEach((user) => {
    const cariKodu = String(user.mikroCariCode || '').trim();
    if (!cariKodu) return;
    const listPair = resolveCustomerPriceLists(user, null);
    map.set(cariKodu.toUpperCase(), {
      cariKodu,
      cariAdi: user.displayName || user.mikroName || user.name || cariKodu,
      invoicedListNo: listPair.invoiced,
      whiteListNo: listPair.white,
      priceVisibility: (user.priceVisibility as CustomerInfo['priceVisibility']) ?? null,
      useLastPrices: Boolean(user.useLastPrices),
      lastPriceGuardType: (user.lastPriceGuardType as CustomerInfo['lastPriceGuardType']) ?? null,
      lastPriceGuardInvoicedListNo: user.lastPriceGuardInvoicedListNo ?? null,
      lastPriceGuardWhiteListNo: user.lastPriceGuardWhiteListNo ?? null,
      lastPriceCostBasis: (user.lastPriceCostBasis as CustomerInfo['lastPriceCostBasis']) ?? null,
      lastPriceMinCostPercent: user.lastPriceMinCostPercent ?? null,
    });
  });
  return map;
};

/**
 * Her cari x urun icin SON satis satirini toplu ceker (chunk'li, salt SELECT).
 * ROW_NUMBER() OVER (PARTITION BY cari, stok ORDER BY tarih DESC) kalibi.
 * Ayni sorguda window SUM ile son 90 gun adedi de alinir.
 */
const fetchLastSaleRows = async (
  cariCodes: string[],
  _lookbackDays: number
): Promise<LastSaleRow[]> => {
  const now = new Date();
  const last90Start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const last90Literal = toMssqlDateLiteral(last90Start);

  const rows: LastSaleRow[] = [];

  for (const chunk of chunkArray(cariCodes, CARI_CHUNK_SIZE)) {
    const remaining = MAX_SALE_ROWS - rows.length;
    if (remaining <= 0) break;

    const inClause = chunk
      .map((code) => `'${escapeSqlLiteral(code)}'`)
      .join(', ');

    // SON-satis satiri, cart-pricing'in musteriye GOSTERDIGI son fiyatla ayni satir
    // olmali. Bu yuzden filtre mikroService.getCustomerSalesMovements ile BIREBIR:
    // sth_tip=1 + (evraktip=4 VEYA (evraktip=1 AND fat_uid<>sentinel) VEYA fat_uid=sentinel).
    // sth_normal_iade filtresi YOK ve son-satir SECIMINDE tarih-lookback YOK (cart'ta da
    // yok) — boylece gercek en-son satir secilir; prim filtresi karar verir.
    // son90GunAdet metrigi ayri bir 90-gunluk pencere tutar (satir secimini etkilemez).
    const query = `
      WITH SonSatislar AS (
        SELECT
          RTRIM(sth.sth_cari_kodu) AS cariCode,
          RTRIM(sth.sth_stok_kod) AS productCode,
          sth.sth_tarih AS saleDate,
          CASE
            WHEN sth.sth_miktar = 0 THEN 0
            ELSE sth.sth_tutar / NULLIF(sth.sth_miktar, 0)
          END AS unitPrice,
          ROW_NUMBER() OVER (
            PARTITION BY sth.sth_cari_kodu, sth.sth_stok_kod
            ORDER BY sth.sth_tarih DESC
          ) AS rn,
          SUM(CASE WHEN sth.sth_tarih >= '${last90Literal}' THEN sth.sth_miktar ELSE 0 END) OVER (
            PARTITION BY sth.sth_cari_kodu, sth.sth_stok_kod
          ) AS qtyLast90
        FROM STOK_HAREKETLERI sth WITH (NOLOCK)
        WHERE sth.sth_tip = 1
          AND (
            (sth.sth_evraktip = 4)
            OR
            (sth.sth_evraktip = 1 AND sth.sth_fat_uid <> '00000000-0000-0000-0000-000000000000')
            OR
            (sth.sth_fat_uid = '00000000-0000-0000-0000-000000000000')
          )
          AND RTRIM(sth.sth_cari_kodu) IN (${inClause})
      )
      SELECT TOP ${remaining}
        ss.cariCode,
        ss.productCode,
        ss.saleDate,
        ss.unitPrice,
        ss.qtyLast90,
        RTRIM(ISNULL(st.sto_isim, '')) AS productName
      FROM SonSatislar ss
      LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = ss.productCode
      WHERE ss.rn = 1
        AND ss.unitPrice > 0
      ORDER BY ss.saleDate DESC
    `;

    const recordset = await mikroService.executeQuery(query);
    for (const record of recordset || []) {
      const cariCode = String(record?.cariCode || '').trim();
      const productCode = String(record?.productCode || '').trim();
      if (!cariCode || !productCode) continue;
      const saleDate =
        record.saleDate instanceof Date ? record.saleDate : new Date(record.saleDate);
      if (!Number.isFinite(saleDate.getTime())) continue;
      const unitPrice = toFiniteNumber(record.unitPrice);
      if (unitPrice <= 0) continue;
      rows.push({
        cariCode,
        productCode,
        productName: String(record?.productName || '').trim(),
        saleDate,
        unitPrice,
        qtyLast90: Math.max(0, toFiniteNumber(record.qtyLast90)),
      });
    }
  }

  return rows;
};

/**
 * STOK_SATIS_FIYAT_LISTELERI'nden guncel liste fiyatlarini toplu ceker.
 * Donen yapi: productCode(UPPER) -> (listNo -> fiyat)
 */
const fetchListPriceSnapshot = async (
  productCodes: string[]
): Promise<CanonicalPriceSnapshot> => {
  const map = new Map<string, Map<number, number>>();
  const duplicatePairs = new Set<string>();
  const duplicateProducts = new Set<string>();
  const uniqueCodes = Array.from(new Set(productCodes.filter(Boolean)));

  for (const chunk of chunkArray(uniqueCodes, PRODUCT_CHUNK_SIZE)) {
    const inClause = chunk
      .map((code) => `'${escapeSqlLiteral(code)}'`)
      .join(', ');

    const query = `
      WITH RankedPrices AS (
        SELECT
          UPPER(LTRIM(RTRIM(sfiyat_stokkod))) AS productCode,
          sfiyat_listesirano AS listNo,
          sfiyat_fiyati AS price,
          COUNT(*) OVER (
            PARTITION BY
              UPPER(LTRIM(RTRIM(sfiyat_stokkod))),
              sfiyat_listesirano
          ) AS candidateCount,
          ROW_NUMBER() OVER (
            PARTITION BY
              UPPER(LTRIM(RTRIM(sfiyat_stokkod))),
              sfiyat_listesirano
            ORDER BY
              ISNULL(sfiyat_lastup_date, sfiyat_create_date) DESC,
              sfiyat_create_date DESC,
              sfiyat_Guid DESC
          ) AS rowNo
        FROM STOK_SATIS_FIYAT_LISTELERI WITH (NOLOCK)
        WHERE sfiyat_listesirano IN (${STANDARD_PRICE_LIST_NOS.join(', ')})
          AND sfiyat_deposirano = 0
          AND sfiyat_doviz = 0
          AND sfiyat_odemeplan = 0
          AND sfiyat_iptal = 0
          AND ISNULL(sfiyat_hidden, 0) = 0
          AND UPPER(LTRIM(RTRIM(sfiyat_stokkod))) IN (${inClause})
      )
      SELECT
        productCode,
        listNo,
        price,
        candidateCount
      FROM RankedPrices
      WHERE rowNo = 1
      ORDER BY productCode, listNo
    `;

    const recordset = await mikroService.executeQuery(query);
    const normalized = normalizeCanonicalPriceRows(recordset || []);
    for (const [code, pricesByList] of normalized.prices) {
      if (!map.has(code)) map.set(code, new Map<number, number>());
      const target = map.get(code)!;
      for (const [listNo, price] of pricesByList) {
        target.set(listNo, price);
      }
    }
    normalized.duplicatePairs.forEach((pair) => duplicatePairs.add(pair));
    normalized.duplicateProducts.forEach((code) => duplicateProducts.add(code));
  }

  if (duplicatePairs.size > 0) {
    console.warn(
      'Yapiskan iskonto raporu: legacy duplicate canonical fiyat satirlari ' +
        'deterministik son satirla okundu. ' +
        `Etkilenen urun/liste cifti: ${duplicatePairs.size}; ` +
        `ilk ornekler: ${Array.from(duplicatePairs).slice(0, 10).join(', ')}`
    );
  }

  return {
    prices: map,
    duplicatePairs: Array.from(duplicatePairs).sort(),
    duplicateProducts: Array.from(duplicateProducts).sort(),
  };
};

const buildCanonicalPriceWarnings = (
  snapshot: CanonicalPriceSnapshot
): StickyDiscountWarning[] => {
  if (snapshot.duplicatePairs.length === 0) return [];

  const maxDetails = 100;
  return [
    {
      code: 'DUPLICATE_CANONICAL_PRICE',
      message:
        'Eski Mikro verisinde birden fazla aktif canonical fiyat satiri bulunan ' +
        'urunler deterministik son satirla okundu; bu rapor salt okunurdur.',
      affectedPairCount: snapshot.duplicatePairs.length,
      affectedProductCount: snapshot.duplicateProducts.length,
      affectedProducts: snapshot.duplicateProducts.slice(0, maxDetails),
      affectedPairs: snapshot.duplicatePairs.slice(0, maxDetails),
    },
  ];
};

/**
 * PG Product'tan maliyet bilgisi (COST guard'i icin). productCode(UPPER) -> cost.
 */
const fetchProductCostMap = async (
  productCodes: string[]
): Promise<Map<string, ProductCost>> => {
  const map = new Map<string, ProductCost>();
  const uniqueCodes = Array.from(
    new Set(productCodes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))
  );
  if (uniqueCodes.length === 0) return map;

  for (const chunk of chunkArray(uniqueCodes, 1000)) {
    const products = await prisma.product.findMany({
      where: { mikroCode: { in: chunk } },
      select: { mikroCode: true, currentCost: true, lastEntryPrice: true },
    });
    products.forEach((p) => {
      map.set(String(p.mikroCode || '').trim().toUpperCase(), {
        currentCost: p.currentCost ?? null,
        lastEntryPrice: p.lastEntryPrice ?? null,
      });
    });
  }
  return map;
};

/**
 * PriceChange (price_changes) snapshot'larini TOPLU ceker (productCode IN ...).
 * cart-pricing.fetchPriceChangeSnapshots ile ayni sekil; buraya kopyalandi (o servis
 * degistirilmeden). productCode(UPPER) -> changedAt ASC sirali snapshot dizisi.
 */
const fetchPriceChangeSnapshots = async (
  productCodes: string[]
): Promise<Map<string, PriceChangeSnapshot[]>> => {
  const result = new Map<string, PriceChangeSnapshot[]>();
  const uniqueCodes = Array.from(
    new Set(productCodes.map((code) => String(code || '').trim()).filter(Boolean))
  );
  if (uniqueCodes.length === 0) return result;

  for (const chunk of chunkArray(uniqueCodes, 1000)) {
    const rows = await prisma.priceChange.findMany({
      where: { productCode: { in: chunk } },
      orderBy: { changedAt: 'asc' },
      select: {
        productCode: true,
        changedAt: true,
        priceListNo: true,
        oldPrice: true,
        newPrice: true,
      },
    });
    for (const row of rows) {
      const code = String(row.productCode || '').trim().toUpperCase();
      if (!code) continue;
      const changedAt =
        row.changedAt instanceof Date ? row.changedAt : new Date(row.changedAt as any);
      if (!Number.isFinite(changedAt.getTime())) continue;
      const list = result.get(code) || [];
      list.push({
        changedAt,
        priceListNo:
          row.priceListNo === null || row.priceListNo === undefined
            ? null
            : Number(row.priceListNo),
        oldPrice: toFiniteNumber(row.oldPrice),
        newPrice: toFiniteNumber(row.newPrice),
      });
      result.set(code, list);
    }
  }
  return result;
};

/**
 * Satis anindaki liste fiyati: verilen listNo'nun PriceChange zincirinden.
 * cart-pricing.computeIndexedLastSalePrice icindeki "listPriceAtSale" turetmesiyle
 * ayni: en son changedAt <= saleDate -> newPrice; yoksa ilk sonraki -> oldPrice.
 * Hicbiri yoksa fallback = guncel liste fiyati.
 */
const resolveListPriceAtSale = (
  snapshots: PriceChangeSnapshot[] | undefined,
  listNo: number,
  saleDate: Date,
  currentListPrice: number
): number => {
  const saleTime = saleDate.getTime();
  if (snapshots && snapshots.length > 0 && Number.isFinite(saleTime)) {
    const listSnapshots = snapshots.filter((s) => s.priceListNo === listNo);
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
    const listPriceAtSale = before
      ? toFiniteNumber(before.newPrice)
      : toFiniteNumber(after?.oldPrice);
    if (listPriceAtSale > 0) return listPriceAtSale;
  }
  return currentListPrice;
};

/**
 * Guncel liste fiyati (istenen listeye tam eslesme yoksa ayni bantta bir alt liste).
 * cart getListPriceWithFallback ile ayni mantik.
 */
const resolveCurrentListPrice = (
  prices: Map<number, number> | undefined,
  listNo: number
): number => {
  if (!prices) return 0;
  const exact = toFiniteNumber(prices.get(listNo));
  if (exact > 0) return exact;
  for (const no of getPriceListFallbackChain(listNo)) {
    const price = toFiniteNumber(prices.get(no));
    if (price > 0) return price;
  }
  return 0;
};

export const getStickyDiscountReport = async (params?: {
  lookbackDays?: number;
  minPremiumNowPercent?: number;
}): Promise<StickyDiscountReport> => {
  const lookbackDaysRaw = Number(params?.lookbackDays);
  const lookbackDays =
    Number.isFinite(lookbackDaysRaw) && lookbackDaysRaw > 0
      ? Math.min(Math.trunc(lookbackDaysRaw), 1825)
      : 365;
  const minPremiumNowRaw = Number(params?.minPremiumNowPercent);
  const minPremiumNowPercent =
    Number.isFinite(minPremiumNowRaw) && minPremiumNowRaw >= 0 ? minPremiumNowRaw : 0;

  const emptySummaryBase = {
    params: { lookbackDays, minPremiumNowPercent },
    generatedAt: new Date().toISOString(),
  };
  const emptyReport = (): StickyDiscountReport => ({
    rows: [],
    warnings: [],
    summary: {
      rowCount: 0,
      customerCount: 0,
      totalMonthlyPremiumTL: 0,
      criticalCount: 0,
      worstErosion: [],
      ...emptySummaryBase,
    },
  });

  // 1) Kapsam: aktif + useLastPrices + mikroCariCode dolu musteriler
  const customers = await loadScopedCustomers();
  if (customers.size === 0) return emptyReport();

  // 2) Mikro: her cari x urun icin son satis satiri
  const cariCodes = Array.from(customers.values()).map((c) => c.cariKodu);
  const saleRows = await fetchLastSaleRows(cariCodes, lookbackDays);
  if (saleRows.length === 0) return emptyReport();

  // 3) Guncel liste fiyatlari + maliyet + fiyat degisim gecmisi (bulk)
  const productCodes = saleRows.map((row) => row.productCode);
  const [listPriceSnapshot, costMap, snapshotMap, settings] = await Promise.all([
    fetchListPriceSnapshot(productCodes),
    fetchProductCostMap(productCodes),
    fetchPriceChangeSnapshots(productCodes),
    prisma.settings.findFirst({ select: { lastPriceIndexationEnabled: true } }),
  ]);
  const listPriceMap = listPriceSnapshot.prices;
  const warnings = buildCanonicalPriceWarnings(listPriceSnapshot);
  const indexationEnabled = Boolean(settings?.lastPriceIndexationEnabled);

  // 4) Satir hesabi
  const now = Date.now();
  const rows: StickyDiscountRow[] = [];

  for (const sale of saleRows) {
    const customer = customers.get(sale.cariCode.toUpperCase());
    if (!customer) continue;

    // Rapor listesi cart-pricing'in GORUNUR fiyatiyla ayni bant olmali: WHITE_ONLY
    // musteri sepette kendi standart beyaz/perakende veya faturali listesi
    // uzerinden fiyatlanir; fiziksel numara aralikla tahmin edilmez.
    const isWhiteOnly = customer.priceVisibility === 'WHITE_ONLY';
    const listNo = isWhiteOnly ? customer.whiteListNo : customer.invoicedListNo;
    const productUpper = sale.productCode.toUpperCase();
    const prices = listPriceMap.get(productUpper);
    const guncelListe = resolveCurrentListPrice(prices, listNo);
    if (guncelListe <= 0) continue;

    // Musterinin gordugu son-satis fiyati: ayar acikken cart gibi endekslenir.
    let shownPrice = sale.unitPrice;
    if (indexationEnabled) {
      const indexed = computeIndexedLastSalePrice({
        rawLastSalePrice: sale.unitPrice,
        saleDate: sale.saleDate,
        listNo,
        currentListPrice: toFiniteNumber(prices?.get(listNo)) || guncelListe,
        snapshots: snapshotMap.get(productUpper) || [],
      });
      shownPrice = indexed.price;
    }

    // cart-pricing useLastPrices + guard kuralini BIREBIR replike et: musteri bu
    // fiyati GERCEKTEN goruyor mu? Sadece goruyorsa rapora girer.
    const cost = costMap.get(productUpper) || { currentCost: null, lastEntryPrice: null };
    const guardInvoiced =
      customer.lastPriceGuardInvoicedListNo && customer.lastPriceGuardInvoicedListNo > 0
        ? toFiniteNumber(prices?.get(customer.lastPriceGuardInvoicedListNo))
        : 0;
    const guardWhite =
      customer.lastPriceGuardWhiteListNo && customer.lastPriceGuardWhiteListNo > 0
        ? toFiniteNumber(prices?.get(customer.lastPriceGuardWhiteListNo))
        : 0;

    const override = resolveLastPriceOverride({
      config: {
        useLastPrices: customer.useLastPrices,
        lastPriceGuardType: customer.lastPriceGuardType,
        lastPriceGuardInvoicedListNo: customer.lastPriceGuardInvoicedListNo,
        lastPriceGuardWhiteListNo: customer.lastPriceGuardWhiteListNo,
        lastPriceCostBasis: customer.lastPriceCostBasis,
        lastPriceMinCostPercent: customer.lastPriceMinCostPercent,
      },
      lastSalePrice: shownPrice,
      // guncelListe = musterinin GORUNUR listesi (WHITE_ONLY->beyaz, digeri->faturali;
      // guncel, bant fallback'li). resolveLastPriceOverride PRICE_LIST guard'inda guard
      // bossa bu referansi kullanir ve priceVisibility'ye gore dogru tarafi (white/invoiced)
      // secer — her iki tarafi da guncelListe yaparak referans cart-pricing ile eslesir.
      listPrices: { invoiced: guncelListe, white: guncelListe },
      guardPrices: { invoiced: guardInvoiced, white: guardWhite },
      product: { currentCost: cost.currentCost, lastEntryPrice: cost.lastEntryPrice },
      priceVisibility: customer.priceVisibility,
    });
    // Musteri son-satis fiyatini gormuyorsa (guard listeye dusuruyorsa) rapor disi.
    if (!override.usedLastPrice) continue;

    const sonFiyat = shownPrice;
    // Gorunur prim sarti: musteri listeden PAHALI goruyor.
    if (!(sonFiyat > guncelListe)) continue;

    const listeFiyatiSatisAninda = resolveListPriceAtSale(
      snapshotMap.get(productUpper),
      listNo,
      sale.saleDate,
      guncelListe
    );
    if (listeFiyatiSatisAninda <= 0) continue;

    const primSatisAnindaPct =
      ((sonFiyat - listeFiyatiSatisAninda) / listeFiyatiSatisAninda) * 100;
    const primBugunPct = ((sonFiyat - guncelListe) / guncelListe) * 100;
    if (!Number.isFinite(primBugunPct)) continue;
    // minPremiumNowPercent filtresi: bugunku prim >= X olanlar.
    if (primBugunPct < minPremiumNowPercent) continue;

    const erimePct = primSatisAnindaPct - primBugunPct;
    const son90GunAdet = sale.qtyLast90;
    const aylikPrimTL = ((sonFiyat - guncelListe) * son90GunAdet) / 3;
    const fiyatYasiGun = Math.max(
      0,
      Math.floor((now - sale.saleDate.getTime()) / (24 * 60 * 60 * 1000))
    );

    rows.push({
      cariKodu: customer.cariKodu,
      cariAdi: customer.cariAdi,
      stokKodu: sale.productCode,
      stokAdi: sale.productName,
      listNo,
      sonFiyat: round2(sonFiyat),
      sonSatisTarihi: sale.saleDate.toISOString(),
      fiyatYasiGun,
      listeFiyatiSatisAninda: round2(listeFiyatiSatisAninda),
      guncelListeFiyati: round2(guncelListe),
      primSatisAnindaPct: round2(primSatisAnindaPct),
      primBugunPct: round2(primBugunPct),
      erimePct: round2(erimePct),
      son90GunAdet: round2(son90GunAdet),
      aylikPrimTL: round2(aylikPrimTL),
      kritik: primBugunPct <= 10,
    });
  }

  rows.sort((a, b) => b.aylikPrimTL - a.aylikPrimTL);

  // 5) Ozet: en cok erimeye maruz (aylik prim toplamina gore) en kotu 10 cari
  const perCustomer = new Map<
    string,
    { cariAdi: string; toplamAylikPrimTL: number; satirSayisi: number }
  >();
  let totalMonthlyPremiumTL = 0;
  let criticalCount = 0;
  rows.forEach((row) => {
    totalMonthlyPremiumTL += row.aylikPrimTL;
    if (row.kritik) criticalCount += 1;
    const current = perCustomer.get(row.cariKodu) || {
      cariAdi: row.cariAdi,
      toplamAylikPrimTL: 0,
      satirSayisi: 0,
    };
    current.toplamAylikPrimTL += row.aylikPrimTL;
    current.satirSayisi += 1;
    perCustomer.set(row.cariKodu, current);
  });

  const worstErosion = Array.from(perCustomer.entries())
    .map(([cariKodu, value]) => ({
      cariKodu,
      cariAdi: value.cariAdi,
      toplamAylikPrimTL: round2(value.toplamAylikPrimTL),
      satirSayisi: value.satirSayisi,
    }))
    .sort((a, b) => b.toplamAylikPrimTL - a.toplamAylikPrimTL)
    .slice(0, 10);

  return {
    rows,
    warnings,
    summary: {
      rowCount: rows.length,
      customerCount: perCustomer.size,
      totalMonthlyPremiumTL: round2(totalMonthlyPremiumTL),
      criticalCount,
      worstErosion,
      ...emptySummaryBase,
    },
  };
};

export const stickyDiscountService = {
  getStickyDiscountReport,
};

export default stickyDiscountService;
