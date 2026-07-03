/**
 * Yapiskan Iskonto Dedektoru (SALT OKUMA raporu)
 *
 * Problem: useLastPrices carilerde bir kez dusuk fiyatla satis yapildiysa B2B o
 * fiyati "son fiyat" olarak gostermeye devam eder. Liste fiyatlari zamla artarken
 * eski mutlak fiyat yerinde kalir ve marj sessizce erir.
 *
 * Bu servis, son satis fiyati ile carinin ATANAN faturali liste fiyati arasindaki
 * farki (gap) tarar ve tahmini aylik kaybi hesaplar. Mikro'ya SADECE SELECT atar,
 * hicbir yere yazmaz.
 *
 * Response sekli:
 * {
 *   rows: StickyDiscountRow[],       // aylikKayipTL DESC sirali
 *   summary: {
 *     rowCount, customerCount, totalMonthlyLossTL,
 *     worstCustomers: [{ cariKodu, cariAdi, aylikKayipTL, satirSayisi }],  // top 10
 *     params: { minGapPercent, lookbackDays },
 *     generatedAt
 *   }
 * }
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';
import { resolveCustomerPriceLists } from '../utils/customerPricing';

export type StickyDiscountRow = {
  cariKodu: string;
  cariAdi: string;
  stokKodu: string;
  stokAdi: string;
  sonFiyat: number;
  sonSatisTarihi: string; // ISO tarih
  fiyatYasiGun: number;
  listeNo: number;
  listeFiyati: number;
  gapPercent: number;
  son90GunAdet: number;
  aylikKayipTL: number;
};

export type StickyDiscountSummary = {
  rowCount: number;
  customerCount: number;
  totalMonthlyLossTL: number;
  worstCustomers: Array<{
    cariKodu: string;
    cariAdi: string;
    aylikKayipTL: number;
    satirSayisi: number;
  }>;
  params: {
    minGapPercent: number;
    lookbackDays: number;
  };
  generatedAt: string;
};

export type StickyDiscountReport = {
  rows: StickyDiscountRow[];
  summary: StickyDiscountSummary;
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

type CustomerInfo = {
  cariKodu: string;
  cariAdi: string;
  invoicedListNo: number;
};

type LastSaleRow = {
  cariCode: string;
  productCode: string;
  productName: string;
  saleDate: Date;
  unitPrice: number;
  qtyLast90: number;
};

/**
 * Kapsamdaki carileri yukler: aktif, useLastPrices=true, mikroCariCode dolu CUSTOMER.
 * Liste no: user.invoicedPriceListNo ?? tek varsayilan (resolveCustomerPriceLists).
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
  lookbackDays: number
): Promise<LastSaleRow[]> => {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const last90Start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const lookbackLiteral = toMssqlDateLiteral(lookbackStart);
  const last90Literal = toMssqlDateLiteral(last90Start);

  const rows: LastSaleRow[] = [];

  for (const chunk of chunkArray(cariCodes, CARI_CHUNK_SIZE)) {
    const remaining = MAX_SALE_ROWS - rows.length;
    if (remaining <= 0) break;

    const inClause = chunk
      .map((code) => `'${escapeSqlLiteral(code)}'`)
      .join(', ');

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
          AND sth.sth_evraktip IN (1, 4)
          AND ISNULL(sth.sth_normal_iade, 0) = 0
          AND sth.sth_tarih >= '${lookbackLiteral}'
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
const fetchListPriceMap = async (
  productCodes: string[]
): Promise<Map<string, Map<number, number>>> => {
  const map = new Map<string, Map<number, number>>();
  const uniqueCodes = Array.from(new Set(productCodes.filter(Boolean)));

  for (const chunk of chunkArray(uniqueCodes, PRODUCT_CHUNK_SIZE)) {
    const inClause = chunk
      .map((code) => `'${escapeSqlLiteral(code)}'`)
      .join(', ');

    const query = `
      SELECT
        RTRIM(sfiyat_stokkod) AS productCode,
        sfiyat_listesirano AS listNo,
        sfiyat_fiyati AS price
      FROM STOK_SATIS_FIYAT_LISTELERI WITH (NOLOCK)
      WHERE sfiyat_listesirano BETWEEN 1 AND 10
        AND sfiyat_deposirano = 0
        AND sfiyat_doviz = 0
        AND sfiyat_odemeplan = 0
        AND sfiyat_iptal = 0
        AND sfiyat_fiyati > 0
        AND RTRIM(sfiyat_stokkod) IN (${inClause})
    `;

    const recordset = await mikroService.executeQuery(query);
    for (const record of recordset || []) {
      const code = String(record?.productCode || '').trim().toUpperCase();
      const listNo = Number(record?.listNo);
      const price = toFiniteNumber(record?.price);
      if (!code || !Number.isInteger(listNo) || listNo < 1 || listNo > 10 || price <= 0) {
        continue;
      }
      if (!map.has(code)) map.set(code, new Map<number, number>());
      map.get(code)!.set(listNo, price);
    }
  }

  return map;
};

/**
 * Cart tarafindaki getListPriceWithFallback ile ayni mantik: istenen liste bossa
 * ayni banttaki (faturali 6-10) bir alt listeden asagi dogru inilir.
 */
const resolveListPrice = (
  prices: Map<number, number> | undefined,
  listNo: number
): number => {
  if (!prices) return 0;
  const exact = toFiniteNumber(prices.get(listNo));
  if (exact > 0) return exact;
  const min = listNo <= 5 ? 1 : 6;
  const max = listNo <= 5 ? 5 : 10;
  const start = Math.min(Math.max(listNo - 1, min), max);
  for (let no = start; no >= min; no -= 1) {
    const price = toFiniteNumber(prices.get(no));
    if (price > 0) return price;
  }
  return 0;
};

export const getStickyDiscountReport = async (params?: {
  minGapPercent?: number;
  lookbackDays?: number;
}): Promise<StickyDiscountReport> => {
  const minGapPercentRaw = Number(params?.minGapPercent);
  const minGapPercent =
    Number.isFinite(minGapPercentRaw) && minGapPercentRaw >= 0 ? minGapPercentRaw : 5;
  const lookbackDaysRaw = Number(params?.lookbackDays);
  const lookbackDays =
    Number.isFinite(lookbackDaysRaw) && lookbackDaysRaw > 0
      ? Math.min(Math.trunc(lookbackDaysRaw), 1825)
      : 365;

  const emptySummaryBase = {
    params: { minGapPercent, lookbackDays },
    generatedAt: new Date().toISOString(),
  };

  // 1) Kapsam: aktif + useLastPrices + mikroCariCode dolu musteriler
  const customers = await loadScopedCustomers();
  if (customers.size === 0) {
    return {
      rows: [],
      summary: {
        rowCount: 0,
        customerCount: 0,
        totalMonthlyLossTL: 0,
        worstCustomers: [],
        ...emptySummaryBase,
      },
    };
  }

  // 2) Mikro: her cari x urun icin son satis satiri (tek kalip, chunk'li)
  const cariCodes = Array.from(customers.values()).map((c) => c.cariKodu);
  const saleRows = await fetchLastSaleRows(cariCodes, lookbackDays);
  if (saleRows.length === 0) {
    return {
      rows: [],
      summary: {
        rowCount: 0,
        customerCount: 0,
        totalMonthlyLossTL: 0,
        worstCustomers: [],
        ...emptySummaryBase,
      },
    };
  }

  // 3) Guncel liste fiyatlari (bulk)
  const listPriceMap = await fetchListPriceMap(saleRows.map((row) => row.productCode));

  // 4) Gap hesabi
  const now = Date.now();
  const rows: StickyDiscountRow[] = [];

  for (const sale of saleRows) {
    const customer = customers.get(sale.cariCode.toUpperCase());
    if (!customer) continue;

    const listeNo = customer.invoicedListNo;
    const listeFiyati = resolveListPrice(
      listPriceMap.get(sale.productCode.toUpperCase()),
      listeNo
    );
    if (listeFiyati <= 0) continue;

    const gapPercent = ((listeFiyati - sale.unitPrice) / listeFiyati) * 100;
    if (!Number.isFinite(gapPercent) || gapPercent < minGapPercent) continue;

    const son90GunAdet = sale.qtyLast90;
    const aylikKayipTL = (son90GunAdet / 3) * (listeFiyati - sale.unitPrice);
    const fiyatYasiGun = Math.max(
      0,
      Math.floor((now - sale.saleDate.getTime()) / (24 * 60 * 60 * 1000))
    );

    rows.push({
      cariKodu: customer.cariKodu,
      cariAdi: customer.cariAdi,
      stokKodu: sale.productCode,
      stokAdi: sale.productName,
      sonFiyat: round2(sale.unitPrice),
      sonSatisTarihi: sale.saleDate.toISOString(),
      fiyatYasiGun,
      listeNo,
      listeFiyati: round2(listeFiyati),
      gapPercent: round2(gapPercent),
      son90GunAdet: round2(son90GunAdet),
      aylikKayipTL: round2(aylikKayipTL),
    });
  }

  rows.sort((a, b) => b.aylikKayipTL - a.aylikKayipTL);

  // 5) Ozet: toplamlar + kayip toplamina gore en kotu 10 cari
  const perCustomer = new Map<string, { cariAdi: string; aylikKayipTL: number; satirSayisi: number }>();
  let totalMonthlyLossTL = 0;
  rows.forEach((row) => {
    totalMonthlyLossTL += row.aylikKayipTL;
    const current = perCustomer.get(row.cariKodu) || {
      cariAdi: row.cariAdi,
      aylikKayipTL: 0,
      satirSayisi: 0,
    };
    current.aylikKayipTL += row.aylikKayipTL;
    current.satirSayisi += 1;
    perCustomer.set(row.cariKodu, current);
  });

  const worstCustomers = Array.from(perCustomer.entries())
    .map(([cariKodu, value]) => ({
      cariKodu,
      cariAdi: value.cariAdi,
      aylikKayipTL: round2(value.aylikKayipTL),
      satirSayisi: value.satirSayisi,
    }))
    .sort((a, b) => b.aylikKayipTL - a.aylikKayipTL)
    .slice(0, 10);

  return {
    rows,
    summary: {
      rowCount: rows.length,
      customerCount: perCustomer.size,
      totalMonthlyLossTL: round2(totalMonthlyLossTL),
      worstCustomers,
      ...emptySummaryBase,
    },
  };
};

export const stickyDiscountService = {
  getStickyDiscountReport,
};

export default stickyDiscountService;
