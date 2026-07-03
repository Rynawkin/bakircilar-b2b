/**
 * Borc-Mal Takasi Radari (SALT OKUMA)
 *
 * Iki yonlu takas firsati:
 *
 * A) MUSTERI tarafi (bize borclu + bize mal SATABILIR):
 *    Vadesi gecmis ALACAGIMIZ (bize borclu) >= minPastDue olan cariler; bunlardan
 *    bize tedarikci olabilecekler (STOKLAR.sto_sat_cari_kod ana tedarikci VEYA son
 *    24 ayda kendisine verilmis satin alma siparisi sip_tip=1). "Nakit yerine su
 *    mali getir, mahsuplasalim."
 *
 * B) TEDARIKCI tarafi (biz borclu + bizden mal ALABILIR):
 *    Bizim BORCLU oldugumuz (payable) >= minPayable olan cariler; bunlardan son 12
 *    ayda BIZDEN mal alanlar. "Sana olan borcumuza karsilik bizden mal al."
 *
 * Bakiye kaynagi: vadeSync.service.ts'in VadeBalance'i dolduran Mikro yaslandirma
 * sorgusunun BIREBIR AYNISI, keyfi cari kodlari icin calistirilir (B2B User sarti
 * YOK). Isaret sozlesmesi: cha_tip=0 -> +meblag (bize borclu / alacak), cha_tip=1
 * -> -meblag (biz borclu). Pozitif net = bize borclu (receivable); negatif net =
 * biz borcluyuz (payable). Bu, /api/financials'in gosterdigi ayni hesaptir.
 *
 * Performans: once ADAY cari kumeleri turetilir (kucuk), sonra yaslandirma SADECE
 * bu adaylar icin hesaplanir. Bu servis Mikro'ya HICBIR yazma yapmaz.
 */

import mikroService from './mikro.service';

const MAX_CANDIDATE_CARILER = 1500;  // yaslandirma hesaplanacak aday cari tavani
const MAX_CUSTOMER_ROWS = 100;       // donen musteri satiri
const MAX_SUPPLIER_ROWS = 100;       // donen tedarikci satiri
const MAX_PRODUCTS_PER_CUSTOMER = 50;
const MAX_PRODUCT_ROWS = 4000;
const PAST_ORDER_LOOKBACK_MONTHS = 24;
const SUPPLIER_SALES_LOOKBACK_MONTHS = 12;
const TOP_SUPPLIER_PRODUCTS = 20;

export interface BarterDepotNeed {
  min: number;
  stock: number;
  openCustomer: number;   // acik (alinan) musteri siparisi kalani — rezerve stok
  openPurchase: number;   // acik (verilen) satin alma siparisi kalani — yolda gelen
  effectiveStock: number; // stock - openCustomer + openPurchase
  need: number;           // min > 0 ? max(0, min - effectiveStock) : 0
}

export interface BarterProductRow {
  productCode: string;
  productName: string;
  isMainSupplier: boolean;
  hasPastOrders: boolean;
  merkez: BarterDepotNeed;
  topca: BarterDepotNeed;
  needQuantity: number;
  unitCost: number;
  amount: number;
}

export interface BarterCustomerRow {
  cariCode: string;
  cariName: string;
  pastDueBalance: number;  // vadesi gecmis alacak (bize borclu)
  totalBalance: number;    // toplam bakiye (bize borclu, pozitif)
  pastDueDate: string | null;
  products: BarterProductRow[];
  productCount: number;
  barterPotential: number; // urun ihtiyaclarinin toplam tutari
  cappedPotential: number; // min(vadesi gecmis bakiye, barterPotential)
}

export interface BarterSupplierProductRow {
  productCode: string;
  productName: string;
  last12moQty: number;
  last12moAmount: number;
}

export interface BarterSupplierRow {
  cariCode: string;
  cariName: string;
  payableBalance: number;    // bizim borcumuz (pozitif buyukluk)
  pastDuePayable: number;    // vadesi gecmis borcumuz (pozitif buyukluk)
  lastPurchaseDate: string | null; // bizden son mal alis tarihi
  ourProductsTheyBuy: BarterSupplierProductRow[];
  offsetPotential: number;   // min(payableBalance, son 12 ay bizden alim tutari)
}

export interface BarterRadarReport {
  minPastDue: number;
  minPayable: number;
  customers: BarterCustomerRow[];
  suppliers: BarterSupplierRow[];
  summary: {
    customerCount: number;
    supplierCount: number;
    totalReceivablePotential: number; // musteri cappedPotential toplami
    totalPayablePotential: number;    // tedarikci offsetPotential toplami
    /**
     * Aday cari sorgularindan biri MAX_CANDIDATE_CARILER tavanina dayandi mi?
     * true ise sonuclar EKSIK olabilir (bazi uygun cariler adaya alinmamis olabilir);
     * frontend kullaniciyi uyarabilir.
     */
    truncated: boolean;
  };
  generatedAt: string;
}

type AgingRow = {
  cariCode: string;
  cariName: string;
  pastDueBalance: number; // net (cha_tip=0 +, cha_tip=1 -)
  notDueBalance: number;
  totalBalance: number;
  pastDueDate: Date | null;
};

const escapeSqlLiteral = (value: string): string => String(value || '').replace(/'/g, "''");
const round2 = (value: number): number => Math.round(value * 100) / 100;

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

/**
 * vadeSync.normalizeBalanceBuckets ile ayni: net toplam >= 0 iken negatif kova
 * digerine tasinir. Burada isareti KORURUZ (musteri/tedarikci ayrimi net toplamin
 * isaretinden gelir), sadece bucket'lari duzeltiriz.
 */
const normalizeBuckets = (pastDue: number, notDue: number) => {
  const total = round2(pastDue + notDue);
  let resolvedPastDue = pastDue;
  let resolvedNotDue = notDue;
  if (total >= 0) {
    if (resolvedPastDue < 0) {
      resolvedNotDue += resolvedPastDue;
      resolvedPastDue = 0;
    } else if (resolvedNotDue < 0) {
      resolvedPastDue += resolvedNotDue;
      resolvedNotDue = 0;
    }
  }
  return {
    pastDueBalance: round2(resolvedPastDue),
    notDueBalance: round2(resolvedNotDue),
    totalBalance: round2(resolvedPastDue + resolvedNotDue),
  };
};

class BarterRadarService {
  /**
   * Aday cari kodlari icin vadeSync yaslandirma sorgusunu (BIREBIR ayni filtre +
   * fn_OpVadeTarih + isaret sozlesmesi) calistirir. cariCode -> AgingRow.
   */
  private async computeAgingForCariler(cariCodes: string[]): Promise<Map<string, AgingRow>> {
    const map = new Map<string, AgingRow>();
    const unique = Array.from(new Set(cariCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)));
    if (unique.length === 0) return map;

    for (const chunk of chunkArray(unique, 200)) {
      const inClause = chunk.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');
      // vadeSync.fetchMikroBalances ile ayni govde; sadece cari_kod IN (...) eklendi.
      const query = `
        SET NOCOUNT ON;
        SELECT
          c.cari_kod AS cariCode,
          LTRIM(RTRIM(ISNULL(c.cari_unvan1, ''))) AS cariName,
          SUM(CASE
            WHEN vt.vade_tarihi < CAST(GETDATE() AS DATE)
            THEN CASE WHEN h.cha_tip = 0 THEN h.cha_meblag ELSE -h.cha_meblag END
            ELSE 0
          END) AS pastDueBalance,
          MAX(CASE WHEN vt.vade_tarihi < CAST(GETDATE() AS DATE) THEN vt.vade_tarihi END) AS pastDueDate,
          SUM(CASE
            WHEN vt.vade_tarihi >= CAST(GETDATE() AS DATE)
            THEN CASE WHEN h.cha_tip = 0 THEN h.cha_meblag ELSE -h.cha_meblag END
            ELSE 0
          END) AS notDueBalance
        FROM CARI_HESAPLAR c
        LEFT JOIN CARI_HESAP_HAREKETLERI h
          ON h.cha_kod = c.cari_kod
          AND ISNULL(h.cha_iptal, 0) = 0
          AND h.cha_cari_cins = 0
          AND h.cha_tpoz = 0
          AND ISNULL(h.cha_meblag_ana_doviz_icin_gecersiz_fl, 0) = 0
        OUTER APPLY (
          SELECT dbo.fn_OpVadeTarih(h.cha_vade, h.cha_tarihi) AS vade_tarihi
        ) vt
        WHERE c.cari_kod IS NOT NULL
          AND c.cari_kod <> ''
          AND UPPER(LTRIM(RTRIM(c.cari_kod))) IN (${inClause})
        GROUP BY c.cari_kod, c.cari_unvan1
      `;

      const rows = await mikroService.executeQuery(query);
      for (const row of Array.isArray(rows) ? rows : []) {
        const cariCode = String(row?.cariCode || '').trim().toUpperCase();
        if (!cariCode) continue;
        const rawPastDue = Number(row?.pastDueBalance) || 0;
        const rawNotDue = Number(row?.notDueBalance) || 0;
        const buckets = normalizeBuckets(rawPastDue, rawNotDue);
        const pastDueDateRaw = row?.pastDueDate ? new Date(row.pastDueDate) : null;
        map.set(cariCode, {
          cariCode,
          cariName: String(row?.cariName || '').trim() || cariCode,
          pastDueBalance: buckets.pastDueBalance,
          notDueBalance: buckets.notDueBalance,
          totalBalance: buckets.totalBalance,
          pastDueDate:
            pastDueDateRaw && !Number.isNaN(pastDueDateRaw.getTime()) ? pastDueDateRaw : null,
        });
      }
    }

    return map;
  }

  async getBarterRadar(options: { minPastDue?: number; minPayable?: number } = {}): Promise<BarterRadarReport> {
    const minPastDueRaw = Number(options.minPastDue);
    const minPastDue = Number.isFinite(minPastDueRaw) && minPastDueRaw > 0 ? minPastDueRaw : 50000;
    const minPayableRaw = Number(options.minPayable);
    const minPayable = Number.isFinite(minPayableRaw) && minPayableRaw > 0 ? minPayableRaw : 50000;

    // ---------- 1) ADAY CARI KUMELERI (kucuk, once turet) ----------

    // A-aday) Bize mal SATABILIR cariler: ana tedarikci (STOKLAR.sto_sat_cari_kod)
    //         VEYA son 24 ayda satin alma siparisi (SIPARISLER sip_tip=1).
    // Deterministik oncelik: son satin alma siparisi EN YENI olan cariler once gelir
    // (recency). Ana tedarikci (tarihsiz) satirlar lastOrderDate=NULL ile en sona
    // duser ama yine de tavan icinde kalabilir. ORDER BY olmadan TOP N keyfi secerdi
    // (kullanicinin "sadece 3 cari" semptomu).
    const supplierCapableRows = await mikroService.executeQuery(`
      SET NOCOUNT ON;
      SELECT TOP ${MAX_CANDIDATE_CARILER} cariCode
      FROM (
        SELECT cariCode, MAX(lastOrderDate) AS lastOrderDate
        FROM (
          SELECT UPPER(LTRIM(RTRIM(s.sto_sat_cari_kod))) AS cariCode, CAST(NULL AS datetime) AS lastOrderDate
          FROM STOKLAR s WITH (NOLOCK)
          WHERE ISNULL(s.sto_pasif_fl, 0) = 0
            AND s.sto_sat_cari_kod IS NOT NULL
            AND LTRIM(RTRIM(s.sto_sat_cari_kod)) <> ''
          UNION ALL
          SELECT UPPER(LTRIM(RTRIM(sip.sip_musteri_kod))) AS cariCode,
            ISNULL(sip.sip_tarih, sip.sip_create_date) AS lastOrderDate
          FROM SIPARISLER sip WITH (NOLOCK)
          WHERE sip.sip_tip = 1
            AND ISNULL(sip.sip_iptal, 0) = 0
            AND sip.sip_musteri_kod IS NOT NULL
            AND LTRIM(RTRIM(sip.sip_musteri_kod)) <> ''
            AND ISNULL(sip.sip_tarih, sip.sip_create_date) >= DATEADD(MONTH, -${PAST_ORDER_LOOKBACK_MONTHS}, CAST(GETDATE() AS date))
        ) u
        WHERE cariCode <> ''
        GROUP BY cariCode
      ) g
      ORDER BY CASE WHEN g.lastOrderDate IS NULL THEN 1 ELSE 0 END, g.lastOrderDate DESC;
    `);
    const supplierCapableTruncated =
      (Array.isArray(supplierCapableRows) ? supplierCapableRows.length : 0) >= MAX_CANDIDATE_CARILER;
    const supplierCapable = new Set(
      (Array.isArray(supplierCapableRows) ? supplierCapableRows : [])
        .map((r: any) => String(r?.cariCode || '').trim().toUpperCase())
        .filter(Boolean)
    );

    // B-aday) BIZDEN mal ALAN cariler (son 12 ay satis) + son alis tarihi.
    // Deterministik oncelik: bizden EN YAKIN zamanda mal alan cariler once gelir.
    // ORDER BY olmadan TOP N keyfi bir kume secip sonuclari eksik gosteriyordu.
    const buyerRows = await mikroService.executeQuery(`
      SET NOCOUNT ON;
      SELECT TOP ${MAX_CANDIDATE_CARILER}
        UPPER(LTRIM(RTRIM(sth.sth_cari_kodu))) AS cariCode,
        MAX(sth.sth_tarih) AS lastPurchaseDate
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      WHERE ISNULL(sth.sth_tip, 0) = 1
        AND ISNULL(sth.sth_cins, 0) = 0
        AND ISNULL(sth.sth_normal_iade, 0) = 0
        AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
        AND ISNULL(sth.sth_iptal, 0) = 0
        AND sth.sth_tarih >= DATEADD(MONTH, -${SUPPLIER_SALES_LOOKBACK_MONTHS}, CAST(GETDATE() AS date))
        AND sth.sth_cari_kodu IS NOT NULL AND LTRIM(RTRIM(sth.sth_cari_kodu)) <> ''
      GROUP BY UPPER(LTRIM(RTRIM(sth.sth_cari_kodu)))
      ORDER BY MAX(sth.sth_tarih) DESC;
    `);
    const buyerTruncated =
      (Array.isArray(buyerRows) ? buyerRows.length : 0) >= MAX_CANDIDATE_CARILER;
    const buyerLastPurchase = new Map<string, Date | null>();
    (Array.isArray(buyerRows) ? buyerRows : []).forEach((r: any) => {
      const cariCode = String(r?.cariCode || '').trim().toUpperCase();
      if (!cariCode) return;
      const d = r?.lastPurchaseDate ? new Date(r.lastPurchaseDate) : null;
      buyerLastPurchase.set(cariCode, d && !Number.isNaN(d.getTime()) ? d : null);
    });

    // ---------- 2) YASLANDIRMA (sadece adaylar) ----------
    const candidateCodes = Array.from(new Set([...supplierCapable, ...buyerLastPurchase.keys()]));
    if (candidateCodes.length === 0) {
      return this.emptyReport(minPastDue, minPayable);
    }
    const agingMap = await this.computeAgingForCariler(candidateCodes);

    // ---------- 3) MUSTERI TARAFI (bize borclu + tedarikci olabilir) ----------
    const customerCariler = candidateCodes.filter((code) => {
      if (!supplierCapable.has(code)) return false;
      const aging = agingMap.get(code);
      return Boolean(aging && aging.pastDueBalance >= minPastDue);
    });

    const customers = await this.buildCustomerRows(customerCariler, agingMap);

    // ---------- 4) TEDARIKCI TARAFI (biz borclu + bizden alabilir) ----------
    const supplierCariler = Array.from(buyerLastPurchase.keys()).filter((code) => {
      const aging = agingMap.get(code);
      // biz borclu => net totalBalance < 0 (payable). payable buyuklugu >= minPayable.
      return Boolean(aging && aging.totalBalance <= -minPayable);
    });

    const suppliers = await this.buildSupplierRows(supplierCariler, agingMap, buyerLastPurchase);

    return {
      minPastDue,
      minPayable,
      customers,
      suppliers,
      summary: {
        customerCount: customers.length,
        supplierCount: suppliers.length,
        totalReceivablePotential: round2(
          customers.reduce((sum, row) => sum + row.cappedPotential, 0)
        ),
        totalPayablePotential: round2(
          suppliers.reduce((sum, row) => sum + row.offsetPotential, 0)
        ),
        truncated: supplierCapableTruncated || buyerTruncated,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private emptyReport(minPastDue: number, minPayable: number): BarterRadarReport {
    return {
      minPastDue,
      minPayable,
      customers: [],
      suppliers: [],
      summary: {
        customerCount: 0,
        supplierCount: 0,
        totalReceivablePotential: 0,
        totalPayablePotential: 0,
        truncated: false,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * MUSTERI satirlari: her cari icin tedarik edebilecegi urunlerdeki depo ihtiyaci
   * (min-bazli, rezerve/yolda-gelen ayarli). barter-radar v1 mantiginin aynisi.
   */
  private async buildCustomerRows(
    cariCodes: string[],
    agingMap: Map<string, AgingRow>
  ): Promise<BarterCustomerRow[]> {
    const cariler = cariCodes.slice(0, MAX_CUSTOMER_ROWS);
    if (cariler.length === 0) return [];

    const inClause = cariler.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');

    const rawRows = await mikroService.executeQuery(`
      SET NOCOUNT ON;
      WITH SupplierProducts AS (
        SELECT
          cariCode,
          productCode,
          MAX(isMain) AS isMainSupplier,
          MAX(isOrder) AS hasPastOrders
        FROM (
          SELECT
            UPPER(LTRIM(RTRIM(s.sto_sat_cari_kod))) AS cariCode,
            UPPER(LTRIM(RTRIM(s.sto_kod))) AS productCode,
            1 AS isMain,
            0 AS isOrder
          FROM STOKLAR s WITH (NOLOCK)
          WHERE ISNULL(s.sto_pasif_fl, 0) = 0
            AND UPPER(LTRIM(RTRIM(ISNULL(s.sto_sat_cari_kod, '')))) IN (${inClause})
          UNION ALL
          SELECT
            UPPER(LTRIM(RTRIM(sip.sip_musteri_kod))) AS cariCode,
            UPPER(LTRIM(RTRIM(sip.sip_stok_kod))) AS productCode,
            0 AS isMain,
            1 AS isOrder
          FROM SIPARISLER sip WITH (NOLOCK)
          WHERE sip.sip_tip = 1
            AND ISNULL(sip.sip_iptal, 0) = 0
            AND UPPER(LTRIM(RTRIM(ISNULL(sip.sip_musteri_kod, '')))) IN (${inClause})
            AND LTRIM(RTRIM(ISNULL(sip.sip_stok_kod, ''))) <> ''
            AND ISNULL(sip.sip_tarih, sip.sip_create_date) >= DATEADD(MONTH, -${PAST_ORDER_LOOKBACK_MONTHS}, CAST(GETDATE() AS date))
        ) u
        GROUP BY cariCode, productCode
      )
      SELECT TOP ${MAX_PRODUCT_ROWS}
        sp.cariCode,
        sp.productCode,
        LTRIM(RTRIM(ISNULL(st.sto_isim, ''))) AS productName,
        CAST(sp.isMainSupplier AS int) AS isMainSupplier,
        CAST(sp.hasPastOrders AS int) AS hasPastOrders,
        CAST(ISNULL(st.sto_standartmaliyet, 0) AS float) AS unitCost,
        CAST(ISNULL(mMin.sdp_min_stok, 0) AS float) AS merkezMin,
        CAST(ISNULL(tMin.sdp_min_stok, 0) AS float) AS topcaMin,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sp.productCode, 1, 0), 0) AS float) AS merkezStock,
        CAST(ISNULL(dbo.fn_DepodakiMiktar(sp.productCode, 6, 0), 0) AS float) AS topcaStock,
        CAST(ISNULL((SELECT SUM(o.sip_miktar - o.sip_teslim_miktar) FROM SIPARISLER o WITH (NOLOCK)
          WHERE o.sip_tip = 0 AND o.sip_depono = 1 AND o.sip_kapat_fl = 0 AND ISNULL(o.sip_iptal, 0) = 0
            AND o.sip_miktar > o.sip_teslim_miktar AND o.sip_stok_kod = sp.productCode), 0) AS float) AS merkezOpenCustomer,
        CAST(ISNULL((SELECT SUM(o.sip_miktar - o.sip_teslim_miktar) FROM SIPARISLER o WITH (NOLOCK)
          WHERE o.sip_tip = 1 AND o.sip_depono = 1 AND o.sip_kapat_fl = 0 AND ISNULL(o.sip_iptal, 0) = 0
            AND o.sip_miktar > o.sip_teslim_miktar AND o.sip_stok_kod = sp.productCode), 0) AS float) AS merkezOpenPurchase,
        CAST(ISNULL((SELECT SUM(o.sip_miktar - o.sip_teslim_miktar) FROM SIPARISLER o WITH (NOLOCK)
          WHERE o.sip_tip = 0 AND o.sip_depono = 6 AND o.sip_kapat_fl = 0 AND ISNULL(o.sip_iptal, 0) = 0
            AND o.sip_miktar > o.sip_teslim_miktar AND o.sip_stok_kod = sp.productCode), 0) AS float) AS topcaOpenCustomer,
        CAST(ISNULL((SELECT SUM(o.sip_miktar - o.sip_teslim_miktar) FROM SIPARISLER o WITH (NOLOCK)
          WHERE o.sip_tip = 1 AND o.sip_depono = 6 AND o.sip_kapat_fl = 0 AND ISNULL(o.sip_iptal, 0) = 0
            AND o.sip_miktar > o.sip_teslim_miktar AND o.sip_stok_kod = sp.productCode), 0) AS float) AS topcaOpenPurchase
      FROM SupplierProducts sp
      INNER JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sp.productCode
      LEFT JOIN STOK_DEPO_DETAYLARI mMin WITH (NOLOCK)
        ON LTRIM(RTRIM(mMin.sdp_depo_kod)) = sp.productCode AND mMin.sdp_depo_no = 1
      LEFT JOIN STOK_DEPO_DETAYLARI tMin WITH (NOLOCK)
        ON LTRIM(RTRIM(tMin.sdp_depo_kod)) = sp.productCode AND tMin.sdp_depo_no = 6
      WHERE ISNULL(st.sto_pasif_fl, 0) = 0
        AND (ISNULL(mMin.sdp_min_stok, 0) > 0 OR ISNULL(tMin.sdp_min_stok, 0) > 0)
      ORDER BY sp.cariCode, sp.productCode;
    `);

    const productsByCari = new Map<string, BarterProductRow[]>();
    (Array.isArray(rawRows) ? rawRows : []).forEach((row: any) => {
      const cariCode = String(row?.cariCode || '').trim().toUpperCase();
      const productCode = String(row?.productCode || '').trim().toUpperCase();
      if (!cariCode || !productCode) return;

      const merkezMin = Math.max(0, Number(row?.merkezMin) || 0);
      const topcaMin = Math.max(0, Number(row?.topcaMin) || 0);
      const merkezStock = Number(row?.merkezStock) || 0;
      const topcaStock = Number(row?.topcaStock) || 0;
      const merkezOpenCustomer = Math.max(0, Number(row?.merkezOpenCustomer) || 0);
      const merkezOpenPurchase = Math.max(0, Number(row?.merkezOpenPurchase) || 0);
      const topcaOpenCustomer = Math.max(0, Number(row?.topcaOpenCustomer) || 0);
      const topcaOpenPurchase = Math.max(0, Number(row?.topcaOpenPurchase) || 0);
      const merkezEffective = merkezStock - merkezOpenCustomer + merkezOpenPurchase;
      const topcaEffective = topcaStock - topcaOpenCustomer + topcaOpenPurchase;
      const merkezNeed = merkezMin > 0 ? Math.max(0, merkezMin - merkezEffective) : 0;
      const topcaNeed = topcaMin > 0 ? Math.max(0, topcaMin - topcaEffective) : 0;
      const needQuantity = merkezNeed + topcaNeed;
      if (needQuantity <= 0) return;

      const unitCost = Math.max(0, Number(row?.unitCost) || 0);
      const list = productsByCari.get(cariCode) || [];
      list.push({
        productCode,
        productName: String(row?.productName || '').trim() || productCode,
        isMainSupplier: Number(row?.isMainSupplier) === 1,
        hasPastOrders: Number(row?.hasPastOrders) === 1,
        merkez: {
          min: merkezMin,
          stock: merkezStock,
          openCustomer: merkezOpenCustomer,
          openPurchase: merkezOpenPurchase,
          effectiveStock: merkezEffective,
          need: merkezNeed,
        },
        topca: {
          min: topcaMin,
          stock: topcaStock,
          openCustomer: topcaOpenCustomer,
          openPurchase: topcaOpenPurchase,
          effectiveStock: topcaEffective,
          need: topcaNeed,
        },
        needQuantity,
        unitCost,
        amount: needQuantity * unitCost,
      });
      productsByCari.set(cariCode, list);
    });

    return cariler
      .map((cariCode) => {
        const aging = agingMap.get(cariCode);
        if (!aging) return null;
        const products = (productsByCari.get(cariCode) || [])
          .sort((a, b) => b.amount - a.amount)
          .slice(0, MAX_PRODUCTS_PER_CUSTOMER);
        const barterPotential = round2(products.reduce((sum, product) => sum + product.amount, 0));
        return {
          cariCode,
          cariName: aging.cariName,
          pastDueBalance: aging.pastDueBalance,
          totalBalance: aging.totalBalance,
          pastDueDate: aging.pastDueDate ? aging.pastDueDate.toISOString() : null,
          products,
          productCount: products.length,
          barterPotential,
          cappedPotential: round2(Math.min(aging.pastDueBalance, barterPotential)),
        } as BarterCustomerRow;
      })
      .filter((row): row is BarterCustomerRow => Boolean(row && row.productCount > 0))
      .sort((a, b) => b.cappedPotential - a.cappedPotential);
  }

  /**
   * TEDARIKCI satirlari: bizim borclu oldugumuz cariler; her biri icin son 12 ayda
   * BIZDEN aldigi urunlerin ilk 20'si (tutara gore) + mahsup potansiyeli.
   */
  private async buildSupplierRows(
    cariCodes: string[],
    agingMap: Map<string, AgingRow>,
    buyerLastPurchase: Map<string, Date | null>
  ): Promise<BarterSupplierRow[]> {
    const cariler = cariCodes.slice(0, MAX_SUPPLIER_ROWS);
    if (cariler.length === 0) return [];

    const inClause = cariler.map((code) => `'${escapeSqlLiteral(code)}'`).join(', ');

    // Son 12 ay: cari x urun bazinda bizden alim miktari + tutari.
    const rawRows = await mikroService.executeQuery(`
      SET NOCOUNT ON;
      SELECT
        UPPER(LTRIM(RTRIM(sth.sth_cari_kodu))) AS cariCode,
        UPPER(LTRIM(RTRIM(sth.sth_stok_kod))) AS productCode,
        LTRIM(RTRIM(ISNULL(st.sto_isim, ''))) AS productName,
        CAST(SUM(ISNULL(sth.sth_miktar, 0)) AS float) AS qty,
        CAST(SUM(ISNULL(sth.sth_tutar, 0)) AS float) AS amount
      FROM STOK_HAREKETLERI sth WITH (NOLOCK)
      LEFT JOIN STOKLAR st WITH (NOLOCK) ON st.sto_kod = sth.sth_stok_kod
      WHERE ISNULL(sth.sth_tip, 0) = 1
        AND ISNULL(sth.sth_cins, 0) = 0
        AND ISNULL(sth.sth_normal_iade, 0) = 0
        AND ISNULL(sth.sth_evraktip, 0) IN (1, 4)
        AND ISNULL(sth.sth_iptal, 0) = 0
        AND sth.sth_tarih >= DATEADD(MONTH, -${SUPPLIER_SALES_LOOKBACK_MONTHS}, CAST(GETDATE() AS date))
        AND UPPER(LTRIM(RTRIM(ISNULL(sth.sth_cari_kodu, '')))) IN (${inClause})
        AND sth.sth_stok_kod IS NOT NULL AND LTRIM(RTRIM(sth.sth_stok_kod)) <> ''
      GROUP BY
        UPPER(LTRIM(RTRIM(sth.sth_cari_kodu))),
        UPPER(LTRIM(RTRIM(sth.sth_stok_kod))),
        LTRIM(RTRIM(ISNULL(st.sto_isim, '')));
    `);

    const productsByCari = new Map<string, BarterSupplierProductRow[]>();
    const totalBuyByCari = new Map<string, number>();
    (Array.isArray(rawRows) ? rawRows : []).forEach((row: any) => {
      const cariCode = String(row?.cariCode || '').trim().toUpperCase();
      const productCode = String(row?.productCode || '').trim().toUpperCase();
      if (!cariCode || !productCode) return;
      const qty = Number(row?.qty) || 0;
      const amount = Number(row?.amount) || 0;
      const list = productsByCari.get(cariCode) || [];
      list.push({
        productCode,
        productName: String(row?.productName || '').trim() || productCode,
        last12moQty: round2(qty),
        last12moAmount: round2(amount),
      });
      productsByCari.set(cariCode, list);
      totalBuyByCari.set(cariCode, (totalBuyByCari.get(cariCode) || 0) + amount);
    });

    return cariler
      .map((cariCode) => {
        const aging = agingMap.get(cariCode);
        if (!aging) return null;
        const payableBalance = round2(Math.abs(Math.min(0, aging.totalBalance)));
        const pastDuePayable = round2(Math.abs(Math.min(0, aging.pastDueBalance)));
        const products = (productsByCari.get(cariCode) || [])
          .sort((a, b) => b.last12moAmount - a.last12moAmount)
          .slice(0, TOP_SUPPLIER_PRODUCTS);
        const total12moBuy = round2(totalBuyByCari.get(cariCode) || 0);
        const lastPurchase = buyerLastPurchase.get(cariCode) || null;
        return {
          cariCode,
          cariName: aging.cariName,
          payableBalance,
          pastDuePayable,
          lastPurchaseDate: lastPurchase ? lastPurchase.toISOString() : null,
          ourProductsTheyBuy: products,
          offsetPotential: round2(Math.min(payableBalance, total12moBuy)),
        } as BarterSupplierRow;
      })
      .filter((row): row is BarterSupplierRow => Boolean(row && row.offsetPotential > 0))
      .sort((a, b) => b.offsetPotential - a.offsetPotential);
  }
}

export default new BarterRadarService();
